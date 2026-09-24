import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import type { PrinterJobDto } from '@org/contracts';

/** A private LAN target only; the VPS cannot make the laptop connect elsewhere. */
export function isPrivateIpv4(ip: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  const values = ip.split('.').map(Number);
  if (values.length !== 4 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  return values[0] === 10 || (values[0] === 172 && values[1] >= 16 && values[1] <= 31) || (values[0] === 192 && values[1] === 168);
}

export async function printJob(job: PrinterJobDto): Promise<void> {
  if (!/^[A-Za-z0-9+/=]+$/.test(job.payloadBase64) || job.payloadBase64.length > 200_000) {
    throw new Error('Payload ESC/POS inválido');
  }
  const bytes = Buffer.from(job.payloadBase64, 'base64');
  if (!bytes.length || bytes.length > 150_000) throw new Error('Ticket vacío o demasiado grande');
  const copies = job.destination.copies;
  if (!Number.isInteger(copies) || copies < 1 || copies > 3) throw new Error('Número de copias inválido');
  for (let i = 0; i < copies; i++) {
    if (job.destination.transport === 'NETWORK') {
      const { host, port } = job.destination;
      if (!host || !isPrivateIpv4(host) || port !== 9100) throw new Error('IP/puerto de impresora inválidos');
      await printNetwork(host, port, bytes);
    } else if (job.destination.transport === 'USB') {
      const name = job.destination.printerName;
      if (!name || name.length > 120) throw new Error('Nombre de impresora Windows inválido');
      await printWindowsRaw(name, bytes);
    } else {
      throw new Error('Transporte desconocido');
    }
  }
}

export function printNetwork(host: string, port: number, bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, timeout: 10000 });
    let settled = false;
    const fail = (error: Error) => { if (!settled) { settled = true; socket.destroy(); reject(error); } };
    socket.once('timeout', () => fail(new Error('Timeout impresora de red')));
    socket.once('error', fail);
    socket.once('connect', () => socket.end(bytes));
    socket.once('close', (hadError) => {
      if (!settled && !hadError) { settled = true; resolve(); }
      else if (!settled) fail(new Error('Conexión de impresora cerrada con error'));
    });
  });
}

/** Winspool RAW, not browser print nor PDF. Arguments are base64-encoded before embedding. */
export function printWindowsRaw(printerName: string, bytes: Buffer): Promise<void> {
  if (process.platform !== 'win32') return Promise.reject(new Error('USB RAW requiere Windows'));
  const script = `
$ErrorActionPreference = 'Stop'
$inputJson = [Console]::In.ReadLine() | ConvertFrom-Json
$name = [string]$inputJson.printerName
$data = [Convert]::FromBase64String([string]$inputJson.payloadBase64)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr handle, int level, ref DOCINFO info);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);
  public static void Send(string name, byte[] data) {
    IntPtr handle;
    if (!OpenPrinter(name, out handle, IntPtr.Zero)) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      var info = new DOCINFO { pDocName = "Mi Narcita", pDatatype = "RAW" };
      if (StartDocPrinter(handle, 1, ref info) == 0) throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(handle)) throw new Exception("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
        try { int written; if (!WritePrinter(handle, data, data.Length, out written) || written != data.Length) throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error()); }
        finally { EndPagePrinter(handle); }
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
'@
[RawPrinter]::Send($name, $data)
`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    child.stdin.end(JSON.stringify({ printerName, payloadBase64: bytes.toString('base64') }) + '\n');
    let errorText = '';
    const timeout = setTimeout(() => child.kill(), 30_000);
    child.stderr.on('data', (chunk: Buffer) => { errorText += chunk.toString().slice(0, 500); });
    child.once('error', (err) => { clearTimeout(timeout); reject(err); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Spooler Windows falló (${code}): ${errorText.slice(0, 300)}`));
    });
  });
}

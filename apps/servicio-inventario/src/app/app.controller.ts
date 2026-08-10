import { Controller, Get, Post, Body, Param, Patch, Delete, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { AppService } from './app.service';
import { CrearCategoriaCommand, ActualizarCategoriaCommand, CrearProductoCommand, ActualizarProductoCommand, ListarProductosQuery, ObtenerProductosLoteCommand, AgregarAlMenuCommand, ActualizarMenuDiarioCommand } from '@org/contracts';

// Lectura del catálogo: la usan inventario/carta (admin, sistema, gerencia) y
// también el comandero del PWA (cajero, mesero) al armar pedidos. La gestión
// del catálogo (mutaciones) queda restringida a administración por método.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'CAJERO', 'MESERO')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getHello();
  }

  // --- CATEGORÍAS ---

  @Get('categorias')
  listarCategorias() {
    return this.appService.listarCategorias();
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('categorias')
  crearCategoria(@Body() body: CrearCategoriaCommand) {
    return this.appService.crearCategoria(body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('categorias/:id')
  actualizarCategoria(@Param('id') id: string, @Body() body: ActualizarCategoriaCommand) {
    return this.appService.actualizarCategoria(id, body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('categorias/:id')
  eliminarCategoria(@Param('id') id: string) {
    return this.appService.eliminarCategoria(id);
  }

  // --- PRODUCTOS ---

  @Get('productos')
  listarProductos(@Query() query: ListarProductosQuery) {
    return this.appService.listarProductos(query);
  }

  @Get('productos/:id')
  obtenerProducto(@Param('id') id: string) {
    return this.appService.obtenerProducto(id);
  }

  // Consulta por lote: la invoca servicio-pedidos con token SISTEMA (cold-start).
  @Post('productos/lote')
  obtenerProductosLote(@Body() body: ObtenerProductosLoteCommand) {
    return this.appService.obtenerProductosLote(body.ids);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('productos')
  crearProducto(@Body() body: CrearProductoCommand) {
    return this.appService.crearProducto(body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('productos/:id/stock')
  actualizarStock(@Param('id') id: string, @Body('stock') stock: number) {
    return this.appService.actualizarStock(id, stock);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('productos/:id')
  actualizarProducto(@Param('id') id: string, @Body() body: ActualizarProductoCommand) {
    return this.appService.actualizarProducto(id, body);
  }

  // --- MENÚ DEL DÍA ---
  // Lectura abierta al comandero (mesero/cajero); gestión restringida a admin,
  // igual que el resto del catálogo.

  @Get('menu-diario')
  listarMenuDelDia(@Query('fecha') fecha?: string) {
    return this.appService.listarMenuDelDia(fecha);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('menu-diario')
  agregarAlMenu(@Body() body: AgregarAlMenuCommand) {
    return this.appService.agregarAlMenu(body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('menu-diario/:id')
  actualizarMenuDiario(@Param('id') id: string, @Body() body: ActualizarMenuDiarioCommand) {
    return this.appService.actualizarMenuDiario(id, body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('menu-diario/:id')
  quitarDelMenu(@Param('id') id: string) {
    return this.appService.quitarDelMenu(id);
  }
}

-- Dedupe previo a la constraint UNIQUE de abajo: repuntos + purga de
-- categorías duplicadas por nombre (case-insensitive, sin espacios extra),
-- creadas por reseeds repetidos (crearCategoria no validaba unicidad).
-- Sin este paso, la CREATE UNIQUE INDEX de más abajo fallaría contra
-- cualquier entorno que ya tenga duplicados (p.ej. producción).
WITH grupos AS (
  SELECT
    id,
    "createdAt",
    first_value(id) OVER (
      PARTITION BY lower(trim(nombre))
      ORDER BY "createdAt" ASC, id ASC
    ) AS keeper_id
  FROM categorias
),
perdedores AS (
  SELECT id, keeper_id FROM grupos WHERE id <> keeper_id
)
UPDATE productos
SET "categoriaId" = perdedores.keeper_id
FROM perdedores
WHERE productos."categoriaId" = perdedores.id;

-- productos_categoriaId_fkey es ON DELETE RESTRICT: el repunte de arriba
-- es obligatorio antes de este DELETE, o la FK lo bloquea.
DELETE FROM categorias
WHERE id IN (
  SELECT g.id FROM (
    SELECT
      id,
      first_value(id) OVER (
        PARTITION BY lower(trim(nombre))
        ORDER BY "createdAt" ASC, id ASC
      ) AS keeper_id
    FROM categorias
  ) g
  WHERE g.id <> g.keeper_id
);

-- Recorta espacios sobrantes en los nombres que sobreviven, para que
-- "Bebidas " y "Bebidas" no queden como dos filas distintas bajo la
-- constraint exacta de más abajo.
UPDATE categorias SET nombre = trim(nombre) WHERE nombre <> trim(nombre);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

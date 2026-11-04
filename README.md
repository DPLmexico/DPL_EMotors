# Selector de Componentes para Motores — DPL

Herramienta web gratuita: eliges tensión, número de fases y potencia del motor, y te da los
componentes del arrancador (protección, contactor, auxiliares, relevador, seccionador). Con varios
motores armas tu lista de materiales, que se exporta a PDF o se copia como JSON
(`cotsreact-children-v1`) para pegarla en el cotizador.

## Stack

- Lógica de selección en **Rust** (`motor-core/`), compilada a WebAssembly sin dependencias
- [React 19](https://react.dev/) + [Vite](https://vite.dev/) + [Tailwind CSS 4](https://tailwindcss.com/)
- [jsPDF](https://github.com/parallax/jsPDF) para el PDF

## Requisitos

- Node 20+
- Rust con el target `wasm32-unknown-unknown` (`rustup target add wasm32-unknown-unknown`).
  El script usa `~/.cargo/bin/cargo` (rustup) si existe; si no, el `cargo` del PATH.
  Para forzar otro: `CARGO=/ruta/a/cargo npm run build`.

## Desarrollo

```bash
npm install
npm run dev         # compila el WASM y levanta Vite
npm run build:wasm  # solo recompila el WASM (después de cambiar Rust, con dev corriendo)
npm run test:rust   # pruebas de la lógica de selección
npm run build       # build de producción en dist/
npm run lint
```

## Estructura

```
motor-core/                 Crate de Rust (cdylib → WASM, rlib → pruebas)
  src/lib.rs                Trait `Brand`, tipos comunes, JSON e interfaz WASM
  src/brands/mod.rs         Registro de marcas (BRANDS)
  src/brands/abb/           ABB: reglas de selección
    charts/                 Tablas ABB transcritas (60 Hz)
scripts/build-wasm.mjs      Compila y copia el .wasm a src/wasm/
src/logic/motorCore.js      Carga del WASM
src/logic/materials.js      Consolidación, JSON para el cotizador y PDF
src/selector/               UI
```

## Agregar otra marca (p. ej. Siemens)

1. Crear `motor-core/src/brands/siemens/mod.rs` con sus tablas.
2. Implementar `crate::Brand`. Cada marca define sus tablas (tensión/fases), sus tipos de
   arranque (`starters`), sus opciones extra (`extras`), sus tensiones de bobina
   (`coil_voltages`) y su propia `bill_of_materials`, así que
   las reglas pueden ser completamente distintas a las de ABB.
3. Registrarla en `BRANDS` (`motor-core/src/brands/mod.rs`).

La UI se genera desde el catálogo: aparece un selector de marca y no hay que tocar el frontend.

## Licencia

MIT — ver [LICENSE](./LICENSE). El nombre y logo de "DPL México" están excluidos de la licencia y no son de uso libre.

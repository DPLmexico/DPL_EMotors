/**
 * Puente con motor-core (Rust → WASM). Las funciones exportadas devuelven un puntero a
 * JSON en la memoria del módulo y `output_len()` su longitud en bytes.
 */
import wasmUrl from "../wasm/motor_core.wasm?url";

export async function loadMotorCore() {
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const { memory, catalog, select, table, output_len } = instance.exports;
  const decoder = new TextDecoder();
  const read = (ptr) => JSON.parse(decoder.decode(new Uint8Array(memory.buffer, ptr, output_len())));

  return {
    /** [{ id, name, starters, extras, coils, charts: [{ id, label, voltage, phases, defaultCoil, motors }] }] */
    brands: read(catalog()),
    /** Lista de componentes para (marca, tabla, motor, arranque, bits de extras, bobina). */
    select: (brand, chart, motor, starter, extras, coil) =>
      read(select(brand, chart, motor, starter, extras, coil)),
    /** Tabla de selección completa: { columns: [categoría], rows: [[{ text, note } | null]] } */
    table: (brand, chart, starter, extras, coil) => read(table(brand, chart, starter, extras, coil)),
  };
}

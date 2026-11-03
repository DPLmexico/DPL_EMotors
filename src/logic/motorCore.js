/**
 * Puente con motor-core (Rust → WASM). Las funciones exportadas devuelven un puntero a
 * JSON en la memoria del módulo y `output_len()` su longitud en bytes.
 */
import wasmUrl from "../wasm/motor_core.wasm?url";

export async function loadMotorCore() {
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const { memory, catalog, select, output_len } = instance.exports;
  const decoder = new TextDecoder();
  const read = (ptr) => JSON.parse(decoder.decode(new Uint8Array(memory.buffer, ptr, output_len())));

  return {
    /** [{ id, name, starters, extras, charts: [{ id, label, voltage, phases, motors }] }] */
    brands: read(catalog()),
    /** Lista de componentes para (marca, tabla, motor, arranque, bits de extras). */
    select: (brand, chart, motor, starter, extras) =>
      read(select(brand, chart, motor, starter, extras)),
  };
}

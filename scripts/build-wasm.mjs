// Compila motor-core a WebAssembly y copia el .wasm a src/wasm/.
// Usa el cargo de rustup (~/.cargo/bin) si existe, porque el Rust del sistema puede no
// incluir el target wasm32-unknown-unknown. Se puede forzar con la variable CARGO.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const rustupCargo = join(homedir(), ".cargo", "bin", "cargo");
const cargo = process.env.CARGO || (existsSync(rustupCargo) ? rustupCargo : "cargo");
const target = "wasm32-unknown-unknown";

execFileSync(
  cargo,
  ["build", "--release", "--target", target, "--manifest-path", "motor-core/Cargo.toml"],
  { stdio: "inherit" },
);

mkdirSync("src/wasm", { recursive: true });
copyFileSync(`motor-core/target/${target}/release/motor_core.wasm`, "src/wasm/motor_core.wasm");
console.log("✓ src/wasm/motor_core.wasm");

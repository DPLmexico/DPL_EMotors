//! Selección de componentes para circuitos de motores (60 Hz), multimarca.
//!
//! Cada marca implementa [`Brand`] con sus propias tablas y reglas de selección (ver
//! `brands/abb`). Para agregar otra marca: crear `brands/<marca>/`, implementar el trait y
//! registrarla en [`brands::BRANDS`]. El frontend genera la UI a partir del catálogo, así que
//! no necesita cambios.
//!
//! El frontend consume la librería compilada a `wasm32-unknown-unknown` mediante las funciones
//! `extern "C"` de abajo, que devuelven JSON en un búfer interno (puntero + `output_len`).
//! Sin dependencias ni wasm-bindgen.

pub mod brands;

use std::cell::RefCell;
use std::fmt::Write;

// ─── Tipos comunes a todas las marcas ───────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Motor {
    pub hp: f32,
    pub kw: f32,
    pub amps: f32,
}

/// Una tabla de selección: una combinación de tensión y número de fases.
#[derive(Debug, Clone, Copy)]
pub struct ChartInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub voltage: &'static str,
    pub phases: u8,
}

/// Opción que la UI muestra para una marca. Los tipos de arranque son excluyentes;
/// los extras son casillas que se envían como bits (en el orden en que se declaran).
#[derive(Debug, Clone, Copy)]
pub struct OptionDef {
    pub id: &'static str,
    pub label: &'static str,
    pub three_phase_only: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Options {
    /// Índice dentro de `Brand::starters()`.
    pub starter: usize,
    /// Bit `i` = extra `i` de `Brand::extras()` activado.
    pub extras: u32,
}

impl Options {
    pub fn has(&self, extra: usize) -> bool {
        self.extras & (1 << extra) != 0
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub category: &'static str,
    pub part: String,
    pub description: String,
    pub unit: &'static str,
    pub qty: u32,
    pub note: Option<String>,
}

pub trait Brand: Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn charts(&self) -> &'static [ChartInfo];
    fn motors(&self, chart: usize) -> Vec<Motor>;
    fn starters(&self) -> &'static [OptionDef];
    fn extras(&self) -> &'static [OptionDef];
    /// `None` si la tabla o la potencia no existen.
    fn bill_of_materials(&self, chart: usize, motor: usize, opts: Options) -> Option<Vec<Item>>;
}

// ─── JSON ───────────────────────────────────────────────────────────────────

fn json_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

fn json_motor(out: &mut String, m: &Motor) {
    let _ = write!(out, r#"{{"hp":{},"kw":{},"amps":{}}}"#, m.hp, m.kw, m.amps);
}

fn json_options(out: &mut String, defs: &[OptionDef]) {
    out.push('[');
    for (i, d) in defs.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(r#"{"id":"#);
        json_str(out, d.id);
        out.push_str(r#","label":"#);
        json_str(out, d.label);
        let _ = write!(out, r#","threePhaseOnly":{}}}"#, d.three_phase_only);
    }
    out.push(']');
}

pub fn catalog_to_json() -> String {
    let mut out = String::from("[");
    for (b, brand) in brands::BRANDS.iter().enumerate() {
        if b > 0 {
            out.push(',');
        }
        out.push_str(r#"{"id":"#);
        json_str(&mut out, brand.id());
        out.push_str(r#","name":"#);
        json_str(&mut out, brand.name());
        out.push_str(r#","starters":"#);
        json_options(&mut out, brand.starters());
        out.push_str(r#","extras":"#);
        json_options(&mut out, brand.extras());
        out.push_str(r#","charts":["#);
        for (c, chart) in brand.charts().iter().enumerate() {
            if c > 0 {
                out.push(',');
            }
            out.push_str(r#"{"id":"#);
            json_str(&mut out, chart.id);
            out.push_str(r#","label":"#);
            json_str(&mut out, chart.label);
            out.push_str(r#","voltage":"#);
            json_str(&mut out, chart.voltage);
            let _ = write!(out, r#","phases":{},"motors":["#, chart.phases);
            for (m, motor) in brand.motors(c).iter().enumerate() {
                if m > 0 {
                    out.push(',');
                }
                json_motor(&mut out, motor);
            }
            out.push_str("]}");
        }
        out.push_str("]}");
    }
    out.push(']');
    out
}

pub fn selection_to_json(brand: usize, chart: usize, motor: usize, opts: Options) -> String {
    let Some(brand) = brands::BRANDS.get(brand) else {
        return r#"{"error":"Marca inexistente"}"#.into();
    };
    let Some(items) = brand.bill_of_materials(chart, motor, opts) else {
        return r#"{"error":"Combinación fuera de la tabla"}"#.into();
    };
    let mut out = String::from(r#"{"items":["#);
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(r#"{"category":"#);
        json_str(&mut out, item.category);
        out.push_str(r#","part":"#);
        json_str(&mut out, &item.part);
        out.push_str(r#","description":"#);
        json_str(&mut out, &item.description);
        out.push_str(r#","unit":"#);
        json_str(&mut out, item.unit);
        let _ = write!(out, r#","qty":{},"note":"#, item.qty);
        match &item.note {
            Some(n) => json_str(&mut out, n),
            None => out.push_str("null"),
        }
        out.push('}');
    }
    out.push_str("]}");
    out
}

// ─── Interfaz WASM ──────────────────────────────────────────────────────────

thread_local! {
    static OUTPUT: RefCell<String> = const { RefCell::new(String::new()) };
}

fn emit(s: String) -> *const u8 {
    OUTPUT.with(|o| {
        *o.borrow_mut() = s;
        o.borrow().as_ptr()
    })
}

/// Longitud en bytes del último JSON devuelto por `catalog` o `select`.
#[unsafe(no_mangle)]
pub extern "C" fn output_len() -> usize {
    OUTPUT.with(|o| o.borrow().len())
}

#[unsafe(no_mangle)]
pub extern "C" fn catalog() -> *const u8 {
    emit(catalog_to_json())
}

#[unsafe(no_mangle)]
pub extern "C" fn select(brand: u32, chart: u32, motor: u32, starter: u32, extras: u32) -> *const u8 {
    emit(selection_to_json(
        brand as usize,
        chart as usize,
        motor as usize,
        Options { starter: starter as usize, extras },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogo_incluye_marcas() {
        let cat = catalog_to_json();
        assert!(cat.starts_with(r#"[{"id":"abb","name":"ABB","starters":[{"id":"#));
        assert!(cat.contains(r#""motors":[{"hp":0.17,"kw":0.12,"amps":4}"#));
    }

    #[test]
    fn seleccion_invalida() {
        let opts = Options { starter: 0, extras: 0 };
        assert_eq!(selection_to_json(99, 0, 0, opts), r#"{"error":"Marca inexistente"}"#);
        assert_eq!(
            selection_to_json(0, 99, 0, opts),
            r#"{"error":"Combinación fuera de la tabla"}"#
        );
        assert!(selection_to_json(0, 0, 0, opts).starts_with(r#"{"items":[{"category":"#));
    }
}

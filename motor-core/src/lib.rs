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
    /// Índice dentro de `Brand::coil_voltages()` (tensión de control de la bobina).
    pub coil: usize,
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

/// Celda de la tabla de selección: números de catálogo de una categoría para un motor.
#[derive(Debug, Clone, PartialEq)]
pub struct Cell {
    pub text: String,
    pub note: Option<String>,
}

/// Tabla de selección clásica: una fila por motor, una columna por categoría de componente.
#[derive(Debug, Clone, PartialEq)]
pub struct SelectionTable {
    pub columns: Vec<&'static str>,
    /// `rows[motor][columna]`; `None` = el componente no aplica a ese tamaño ("—").
    pub rows: Vec<Vec<Option<Cell>>>,
}

pub trait Brand: Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn charts(&self) -> &'static [ChartInfo];
    fn motors(&self, chart: usize) -> Vec<Motor>;
    fn starters(&self) -> &'static [OptionDef];
    fn extras(&self) -> &'static [OptionDef];
    /// Tensiones de control que ofrece la marca; cada una traduce la bobina a su manera
    /// (ABB usa bobinas de rango amplio, otras marcas un código por tensión fija).
    fn coil_voltages(&self) -> &'static [OptionDef];
    /// Tensión de control sugerida para una tabla (índice en `coil_voltages`).
    fn default_coil(&self, _chart: usize) -> usize {
        0
    }
    /// `None` si la tabla o la potencia no existen.
    fn bill_of_materials(&self, chart: usize, motor: usize, opts: Options) -> Option<Vec<Item>>;

    /// Tabla de selección de toda una tabla (tensión/fases) con las opciones dadas. Por
    /// defecto se arma con `bill_of_materials` de cada motor, así que sirve para cualquier
    /// marca; una marca puede sobrescribirla si su catálogo se presenta distinto.
    fn selection_table(&self, chart: usize, opts: Options) -> Option<SelectionTable> {
        let motors = self.motors(chart).len();
        if motors == 0 {
            return None;
        }
        let boms = (0..motors)
            .map(|m| self.bill_of_materials(chart, m, opts))
            .collect::<Option<Vec<_>>>()?;
        // Columnas en el orden de la lista; una categoría que solo aparece en algunos tamaños
        // (p. ej. unidad de disparo) se inserta después de la que la precede en su lista.
        let mut columns: Vec<&'static str> = Vec::new();
        for bom in &boms {
            let mut at = 0;
            for item in bom {
                match columns.iter().position(|c| *c == item.category) {
                    Some(i) => at = i + 1,
                    None => {
                        columns.insert(at, item.category);
                        at += 1;
                    }
                }
            }
        }
        let rows = boms
            .iter()
            .map(|bom| {
                columns
                    .iter()
                    .map(|col| {
                        let items: Vec<_> = bom.iter().filter(|i| i.category == *col).collect();
                        (!items.is_empty()).then(|| Cell {
                            text: items
                                .iter()
                                .map(|i| match i.qty {
                                    1 => i.part.clone(),
                                    q => format!("{q}× {}", i.part),
                                })
                                .collect::<Vec<_>>()
                                .join(" + "),
                            note: items.iter().find_map(|i| i.note.clone()),
                        })
                    })
                    .collect()
            })
            .collect();
        Some(SelectionTable { columns, rows })
    }
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
        out.push_str(r#","coils":"#);
        json_options(&mut out, brand.coil_voltages());
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
            let _ = write!(
                out,
                r#","phases":{},"defaultCoil":{},"motors":["#,
                chart.phases,
                brand.default_coil(c)
            );
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

pub fn table_to_json(brand: usize, chart: usize, opts: Options) -> String {
    let Some(table) = brands::BRANDS.get(brand).and_then(|b| b.selection_table(chart, opts)) else {
        return r#"{"error":"Combinación fuera de la tabla"}"#.into();
    };
    let mut out = String::from(r#"{"columns":["#);
    for (i, col) in table.columns.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json_str(&mut out, col);
    }
    out.push_str(r#"],"rows":["#);
    for (r, row) in table.rows.iter().enumerate() {
        if r > 0 {
            out.push(',');
        }
        out.push('[');
        for (c, cell) in row.iter().enumerate() {
            if c > 0 {
                out.push(',');
            }
            match cell {
                None => out.push_str("null"),
                Some(cell) => {
                    out.push_str(r#"{"text":"#);
                    json_str(&mut out, &cell.text);
                    out.push_str(r#","note":"#);
                    match &cell.note {
                        Some(n) => json_str(&mut out, n),
                        None => out.push_str("null"),
                    }
                    out.push('}');
                }
            }
        }
        out.push(']');
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
pub extern "C" fn select(
    brand: u32,
    chart: u32,
    motor: u32,
    starter: u32,
    extras: u32,
    coil: u32,
) -> *const u8 {
    emit(selection_to_json(
        brand as usize,
        chart as usize,
        motor as usize,
        Options { starter: starter as usize, extras, coil: coil as usize },
    ))
}

#[unsafe(no_mangle)]
pub extern "C" fn table(brand: u32, chart: u32, starter: u32, extras: u32, coil: u32) -> *const u8 {
    emit(table_to_json(
        brand as usize,
        chart as usize,
        Options { starter: starter as usize, extras, coil: coil as usize },
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
    fn tabla_de_seleccion() {
        let abb = brands::BRANDS[0];
        // tri440, termomagnético, reversible + auxiliar frontal + seccionador, bobina 120 V
        let opts = Options { starter: 1, extras: 0b111, coil: 2 };
        let t = abb.selection_table(3, opts).unwrap();
        assert_eq!(t.rows.len(), abb.motors(3).len());
        assert!(t.rows.iter().all(|r| r.len() == t.columns.len()));
        let col = |name| t.columns.iter().position(|c| *c == name).unwrap();
        assert_eq!(t.rows[0][col("Contactor")].as_ref().unwrap().text, "2× AF09-30-10-13");
        assert_eq!(
            t.rows[0][col("Contacto auxiliar")].as_ref().unwrap().text,
            "2× CAL4-11 + 2× CA4-10"
        );
        assert!(t.rows.iter().any(|r| r[col("Relevador de sobrecarga")]
            .as_ref()
            .is_some_and(|c| c.note.is_some())));
        let gm = abb.selection_table(0, Options { starter: 0, extras: 0, coil: 2 }).unwrap();
        assert_eq!(gm.columns[..3], ["Guardamotor", "Unidad de disparo", "Kit de unión"]);
        assert!(table_to_json(0, 3, opts).starts_with(r#"{"columns":["Interruptor termomagnético","#));
        assert_eq!(table_to_json(0, 99, opts), r#"{"error":"Combinación fuera de la tabla"}"#);
    }

    #[test]
    fn seleccion_invalida() {
        let opts = Options { starter: 0, extras: 0, coil: 0 };
        assert_eq!(selection_to_json(99, 0, 0, opts), r#"{"error":"Marca inexistente"}"#);
        assert_eq!(
            selection_to_json(0, 99, 0, opts),
            r#"{"error":"Combinación fuera de la tabla"}"#
        );
        assert!(selection_to_json(0, 0, 0, opts).starts_with(r#"{"items":[{"category":"#));
    }
}

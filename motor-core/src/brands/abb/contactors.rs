//! Contactores AF — Tabla de selección por tensión de bobina.
//!
//! Transcrito del catálogo ABB. Solo la bobina 24–60 V de AF09…AF30 es variante Z.
//! Cada fila da el número de catálogo completo para cada rango de bobina;
//! `None` = el catálogo muestra "—" (no disponible).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoilRange {
    /// 24–60 V (código -21 con Z en AF09Z…AF30Z, -11 sin Z en AF40…AF370).
    V24_60,
    /// 100–250 V (código -13).
    V100_250,
    /// 250–500 V (código -14).
    V250_500,
}

impl CoilRange {
    pub fn label(self) -> &'static str {
        match self {
            CoilRange::V24_60 => "24-60 V",
            CoilRange::V100_250 => "100-250 V",
            CoilRange::V250_500 => "250-500 V",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ContactorRow {
    /// Tamaño tal como aparece en las tablas de motores (p. ej. "AF09").
    pub frame: &'static str,
    pub v24_60: Option<&'static str>,
    pub v100_250: Option<&'static str>,
    pub v250_500: Option<&'static str>,
}

impl ContactorRow {
    pub fn code(&self, coil: CoilRange) -> Option<&'static str> {
        match coil {
            CoilRange::V24_60 => self.v24_60,
            CoilRange::V100_250 => self.v100_250,
            CoilRange::V250_500 => self.v250_500,
        }
    }
}

const fn row(
    frame: &'static str,
    v24_60: Option<&'static str>,
    v100_250: &'static str,
    v250_500: &'static str,
) -> ContactorRow {
    ContactorRow { frame, v24_60, v100_250: Some(v100_250), v250_500: Some(v250_500) }
}

pub const ROWS: &[ContactorRow] = &[
    row("AF09", Some("AF09Z-30-10-21"), "AF09-30-10-13", "AF09-30-10-14"),
    row("AF12", Some("AF12Z-30-10-21"), "AF12-30-10-13", "AF12-30-10-14"),
    row("AF16", Some("AF16Z-30-10-21"), "AF16-30-10-13", "AF16-30-10-14"),
    row("AF26", Some("AF26Z-30-00-21"), "AF26-30-00-13", "AF26-30-00-14"),
    row("AF30", Some("AF30Z-30-00-21"), "AF30-30-00-13", "AF30-30-00-14"),
    row("AF40", Some("AF40-30-00-11"), "AF40-30-00-13", "AF40-30-00-14"),
    row("AF52", Some("AF52-30-00-11"), "AF52-30-00-13", "AF52-30-00-14"),
    row("AF65", Some("AF65-30-00-11"), "AF65-30-00-13", "AF65-30-00-14"),
    row("AF80", Some("AF80-30-00-11"), "AF80-30-00-13", "AF80-30-00-14"),
    row("AF96", Some("AF96-30-00-11"), "AF96-30-00-13", "AF96-30-00-14"),
    row("AF116", Some("AF116-30-11-11"), "AF116-30-11-13", "AF116-30-11-14"),
    row("AF140", Some("AF140-30-11-11"), "AF140-30-11-13", "AF140-30-11-14"),
    row("AF190", Some("AF190-30-11-11"), "AF190-30-11-13", "AF190-30-11-14"),
    row("AF205", Some("AF205-30-11-11"), "AF205-30-11-13", "AF205-30-11-14"),
    row("AF265", Some("AF265-30-11-11"), "AF265-30-11-13", "AF265-30-11-14"),
    row("AF370", Some("AF370-30-11-11"), "AF370-30-11-13", "AF370-30-11-14"),
    row("AF400", None, "AF400-30-11-13", "AF400-30-11-14"),
    row("AF580", None, "AF580-30-11-13", "AF580-30-11-14"),
];

pub fn find(frame: &str) -> Option<&'static ContactorRow> {
    ROWS.iter().find(|r| r.frame == frame)
}

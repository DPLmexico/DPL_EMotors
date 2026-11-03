//! ABB motor protection selection charts (60 Hz), one module per chart.
//!
//! Each chart is a list of `MotorRow`, one per motor size (one column of the printed chart).
//! Ranges are `(min, max)` in amperes. `None` means the chart shows "-" for that cell,
//! or (for single-phase charts) that the row doesn't exist.

pub mod single_phase_110_127v;
pub mod single_phase_220_240v;
pub mod three_phase_220_240v;
pub mod three_phase_440_480v;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MotorRow {
    /// Motor power in HP.
    pub hp: f32,
    /// Motor power in kW.
    pub kw: f32,
    /// Rated current in A.
    pub amps: f32,
    /// Circuit breaker (S20x miniature breaker or Tmax XT).
    pub breaker: &'static str,
    /// Manual motor protector (MS132/MS165) or XT breaker + Ekip trip unit.
    pub protector: &'static str,
    /// Motor protector current setting range.
    pub protector_range: Option<(f32, f32)>,
    /// Protector-to-contactor link kit (BEA).
    pub link_kit: Option<&'static str>,
    /// Contactor (AF).
    pub contactor: &'static str,
    /// Auxiliary contact block (CAL).
    pub aux_contact: &'static str,
    /// Front-mounted auxiliary contact (CA4-10).
    pub aux_contact_front: Option<&'static str>,
    /// Mechanical interlock for reversing starters (three-phase only).
    pub interlock: Option<&'static str>,
    /// Reversing starter wiring kit (three-phase only).
    pub reversing_kit: Option<&'static str>,
    /// Overload relay (TF/TA/EF/E…DU).
    pub overload: &'static str,
    /// Overload relay adjustment range.
    pub overload_range: (f32, f32),
    /// Last row of the chart (BW/OTP/OT).
    pub disconnector: &'static str,
}

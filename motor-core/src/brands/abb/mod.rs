//! ABB: tablas de selección de protección de motores (60 Hz) y reglas para armar la lista.

pub mod charts;

use crate::{Brand, ChartInfo, Item, Motor, OptionDef, Options};
use charts::MotorRow;

pub struct Abb;

const CHARTS: &[(ChartInfo, &[MotorRow])] = &[
    (
        ChartInfo { id: "mono127", label: "Monofásico 110-127 V", voltage: "110-127 V", phases: 1 },
        charts::single_phase_110_127v::ROWS,
    ),
    (
        ChartInfo { id: "mono220", label: "Monofásico 220-240 V", voltage: "220-240 V", phases: 1 },
        charts::single_phase_220_240v::ROWS,
    ),
    (
        ChartInfo { id: "tri220", label: "Trifásico 220-240 V", voltage: "220-240 V", phases: 3 },
        charts::three_phase_220_240v::ROWS,
    ),
    (
        ChartInfo { id: "tri440", label: "Trifásico 440-480 V", voltage: "440-480 V", phases: 3 },
        charts::three_phase_440_480v::ROWS,
    ),
];

const CHART_INFO: &[ChartInfo] = &[CHARTS[0].0, CHARTS[1].0, CHARTS[2].0, CHARTS[3].0];

const GUARDAMOTOR: usize = 0;
const TERMOMAGNETICO: usize = 1;

const STARTERS: &[OptionDef] = &[
    OptionDef {
        id: "guardamotor",
        label: "Guardamotor + contactor",
        three_phase_only: false,
    },
    OptionDef {
        id: "termomagnetico",
        label: "Termomagnético + contactor + relevador",
        three_phase_only: false,
    },
];

const REVERSING: usize = 0;
const FRONT_AUX: usize = 1;
const DISCONNECTOR: usize = 2;

const EXTRAS: &[OptionDef] = &[
    OptionDef { id: "reversible", label: "Arranque reversible", three_phase_only: true },
    OptionDef { id: "aux_frontal", label: "Contacto auxiliar frontal", three_phase_only: false },
    OptionDef { id: "seccionador", label: "Seccionador", three_phase_only: false },
];

/// Erratas conocidas de las tablas impresas: (tabla, parte tal como se imprimió, nota).
const SIC_NOTES: &[(&str, &str, &str)] = &[
    ("tri220", "TF96.78", "La tabla ABB imprime «TF96.78»; probablemente es TF96-78. Verificar."),
    ("tri440", "TF65.67", "La tabla ABB imprime «TF65.67»; probablemente es TF65-67. Verificar."),
    (
        "tri440",
        "TF42-26",
        "La tabla ABB imprime «TF42-26» pero el rango es 13-16 A; probablemente es TF42-16. Verificar.",
    ),
];

fn range(r: (f32, f32)) -> String {
    format!("{}-{} A", r.0, r.1)
}

fn breaker_description(part: &str) -> String {
    // S20N-<curva><amperes>, p. ej. S203-K16 → 3P, curva K, 16 A.
    if let Some((series, rating)) = part.split_once('-') {
        if let (Some(poles), Some(curve)) = (series.strip_prefix("S20"), rating.get(..1)) {
            return format!(
                "INTERRUPTOR TERMOMAGNETICO ABB {part} {poles}P {}A CURVA {curve}",
                &rating[1..]
            );
        }
    }
    format!("INTERRUPTOR CAJA MOLDEADA TMAX ABB {part}")
}

fn bill_of_materials(chart: &ChartInfo, row: &MotorRow, opts: Options) -> Vec<Item> {
    let mut items = Vec::new();
    let reversing = opts.has(REVERSING) && chart.phases == 3;
    let per_contactor = if reversing { 2 } else { 1 };
    let mut push = |category, part: &str, description: String, qty| {
        let note = SIC_NOTES
            .iter()
            .find(|(c, p, _)| *c == chart.id && *p == part)
            .map(|(_, _, n)| n.to_string())
            .or_else(|| {
                part.ends_with('*').then(|| {
                    "Marcado con (*) en la tabla ABB; consultar nota del fabricante.".into()
                })
            });
        items.push(Item {
            category,
            part: part.trim_end_matches('*').to_string(),
            description,
            unit: "PZA",
            qty,
            note,
        });
    };

    if opts.starter == TERMOMAGNETICO {
        push("Interruptor termomagnético", row.breaker, breaker_description(row.breaker), 1);
    } else {
        let range_txt = row.protector_range.map(|r| format!(" ({})", range(r))).unwrap_or_default();
        match row.protector.split_once(" + ") {
            Some((breaker, trip)) => {
                push(
                    "Guardamotor",
                    breaker,
                    format!("INTERRUPTOR TMAX ABB {breaker} P/ PROTECCION DE MOTOR"),
                    1,
                );
                push(
                    "Unidad de disparo",
                    trip,
                    format!(
                        "UNIDAD DE DISPARO ABB {}{range_txt}",
                        trip.replace('_', " ").to_uppercase()
                    ),
                    1,
                );
            }
            None => push(
                "Guardamotor",
                row.protector,
                format!("GUARDAMOTOR ABB {}{range_txt}", row.protector),
                1,
            ),
        }
        if let Some(kit) = row.link_kit {
            push("Kit de unión", kit, format!("KIT DE UNION GUARDAMOTOR-CONTACTOR ABB {kit}"), 1);
        }
    }

    push("Contactor", row.contactor, format!("CONTACTOR ABB {}", row.contactor), per_contactor);
    push(
        "Contacto auxiliar",
        row.aux_contact,
        format!("CONTACTO AUXILIAR LATERAL ABB {}", row.aux_contact),
        per_contactor,
    );
    if opts.has(FRONT_AUX) {
        if let Some(front) = row.aux_contact_front {
            push(
                "Contacto auxiliar",
                front,
                format!("CONTACTO AUXILIAR FRONTAL ABB {front}"),
                per_contactor,
            );
        }
    }
    if reversing {
        if let Some(interlock) = row.interlock {
            push(
                "Enclavamiento mecánico",
                interlock,
                format!("ENCLAVAMIENTO MECANICO ABB {}", interlock.trim_end_matches('*')),
                1,
            );
        }
        if let Some(kit) = row.reversing_kit {
            push(
                "Kit reversible",
                kit,
                format!("KIT DE CONEXION P/ ARRANCADOR REVERSIBLE ABB {kit}"),
                1,
            );
        }
    }
    // Con guardamotor la protección de sobrecarga ya está incluida.
    if opts.starter == TERMOMAGNETICO {
        let kind = if row.overload.starts_with('E') { " ELECTRONICO" } else { "" };
        push(
            "Relevador de sobrecarga",
            row.overload,
            format!(
                "RELEVADOR DE SOBRECARGA{kind} ABB {} ({})",
                row.overload,
                range(row.overload_range)
            ),
            1,
        );
    }
    if opts.has(DISCONNECTOR) {
        push("Seccionador", row.disconnector, format!("SECCIONADOR ABB {}", row.disconnector), 1);
    }
    items
}

impl Brand for Abb {
    fn id(&self) -> &'static str {
        "abb"
    }

    fn name(&self) -> &'static str {
        "ABB"
    }

    fn charts(&self) -> &'static [ChartInfo] {
        CHART_INFO
    }

    fn motors(&self, chart: usize) -> Vec<Motor> {
        CHARTS.get(chart).map_or_else(Vec::new, |(_, rows)| {
            rows.iter().map(|r| Motor { hp: r.hp, kw: r.kw, amps: r.amps }).collect()
        })
    }

    fn starters(&self) -> &'static [OptionDef] {
        STARTERS
    }

    fn extras(&self) -> &'static [OptionDef] {
        EXTRAS
    }

    fn bill_of_materials(&self, chart: usize, motor: usize, opts: Options) -> Option<Vec<Item>> {
        if opts.starter != GUARDAMOTOR && opts.starter != TERMOMAGNETICO {
            return None;
        }
        let (info, rows) = CHARTS.get(chart)?;
        Some(bill_of_materials(info, rows.get(motor)?, opts))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chart(id: &str) -> usize {
        CHART_INFO.iter().position(|c| c.id == id).unwrap()
    }

    fn bom(id: &str, motor: usize, starter: usize, extras: u32) -> Vec<Item> {
        Abb.bill_of_materials(chart(id), motor, Options { starter, extras }).unwrap()
    }

    fn parts(items: &[Item]) -> Vec<(&str, u32)> {
        items.iter().map(|i| (i.part.as_str(), i.qty)).collect()
    }

    #[test]
    fn chart_info_coincide_con_tablas() {
        for (i, (info, _)) in CHARTS.iter().enumerate() {
            assert_eq!(CHART_INFO[i].id, info.id);
        }
    }

    #[test]
    fn guardamotor_basico() {
        let items = bom("mono127", 0, GUARDAMOTOR, 0);
        assert_eq!(
            parts(&items),
            [("MS132-6.3", 1), ("BEA16-4", 1), ("AF09", 1), ("CAL4-11", 1)]
        );
        assert_eq!(items[0].description, "GUARDAMOTOR ABB MS132-6.3 (4-6.3 A)");
    }

    #[test]
    fn termomagnetico_reversible_trifasico() {
        let items = bom("tri440", 0, TERMOMAGNETICO, 0b111);
        assert_eq!(
            parts(&items),
            [
                ("S203-K2", 1),
                ("AF09", 2),
                ("CAL4-11", 2),
                ("CA4-10", 2),
                ("VEM4", 1),
                ("BER16-4", 1),
                ("TF42-1.3", 1),
                ("BW325", 1),
            ]
        );
        assert_eq!(items[0].description, "INTERRUPTOR TERMOMAGNETICO ABB S203-K2 3P 2A CURVA K");
    }

    #[test]
    fn reversible_se_ignora_en_monofasico() {
        let items = bom("mono220", 0, GUARDAMOTOR, 1 << REVERSING);
        assert!(items.iter().all(|i| i.qty == 1));
    }

    #[test]
    fn xt_con_unidad_de_disparo() {
        let c = chart("tri220");
        let row = CHARTS[c].1.iter().position(|r| r.protector.contains(" + ")).unwrap();
        let items = bom("tri220", row, GUARDAMOTOR, 1 << REVERSING);
        assert_eq!(items[1].category, "Unidad de disparo");
        assert!(items.iter().all(|i| !i.part.contains('*')));
    }

    #[test]
    fn erratas_llevan_nota() {
        let c = chart("tri220");
        let row = CHARTS[c].1.iter().position(|r| r.overload == "TF96.78").unwrap();
        let items = bom("tri220", row, TERMOMAGNETICO, 0);
        assert!(items.last().unwrap().note.is_some());
    }

    #[test]
    fn arranque_invalido() {
        assert!(Abb.bill_of_materials(0, 0, Options { starter: 7, extras: 0 }).is_none());
    }
}

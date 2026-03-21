export interface AttachedEquipment {
    mrid: string;
    type: 'EnergyConsumer' | 'EnergySource' | 'Capacitor';
    name: string;
    phases?: string[];
    // EnergyConsumer
    active_power_w?: number;
    reactive_power_var?: number;
    customer_count?: number;
    phase_connection?: string;
    // EnergySource
    nominal_voltage_kv?: number;
    voltage_magnitude?: number;
    voltage_angle_deg?: number;
    resistance_ohm?: number;
    reactance_ohm?: number;
    // Capacitor
    b_per_section_S?: number;
    g_per_section_S?: number;
    normal_sections?: number;
}

export interface Node {
    id: string;
    type: string;  // "Bus" | "Substation"
    name: string;
    position: [number, number];
    circuit_id?: string;
    model_id?: string;
    phases?: string[];
    base_voltage_kv?: number;
    attached_equipment?: AttachedEquipment[];
    display_type?: string;
}

export interface Edge {
    source: string;
    target: string;
    id?: string;
    name?: string;
    phases?: string[];
    sourcePosition: [number, number];
    targetPosition: [number, number];
    circuit_id?: string;
    model_id?: string;
    // Set on equipment-type edges
    edge_type?: string;  // "ACLineSegment" | "PowerTransformer" | "Breaker" | "LoadBreakSwitch" | "Fuse" | "Disconnector" | "Recloser"
    is_open?: boolean;
    transformer_kva?: number;
    is_regulator?: boolean;
    length_m?: number;
}

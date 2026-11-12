: Original AURA active sodium effective current for fitting human NWB voltage.
: Formula is a generic phenomenological Boltzmann gate. ALL numerical default
: values are INITIAL HYPOTHESES, not experimentally identified NaV1.2/1.6 rates.
: No noncommercial Allen source or code is embedded.
NEURON {
    SUFFIX aura_na_eff
    USEION na READ ena WRITE ina
    RANGE gbar, vhalf_m, vhalf_h, slope_m, slope_h, tau_m, tau_h, g, ina
    THREADSAFE
}
UNITS {
    (S) = (siemens)
    (mA) = (milliamp)
    (mV) = (millivolt)
}
PARAMETER {
    gbar = 0.01 (S/cm2)
    vhalf_m = -32 (mV)
    vhalf_h = -52 (mV)
    slope_m = 6 (mV)
    slope_h = 6 (mV)
    tau_m = 0.15 (ms)
    tau_h = 1.3 (ms)
}
STATE { m h }
ASSIGNED {
    v (mV)
    ena (mV)
    ina (mA/cm2)
    g (S/cm2)
    m_inf
    h_inf
}
BREAKPOINT {
    SOLVE states METHOD cnexp
    g = gbar*m*m*m*h
    ina = g*(v-ena)
}
INITIAL {
    rates()
    m = m_inf
    h = h_inf
}
DERIVATIVE states {
    rates()
    m' = (m_inf-m)/tau_m
    h' = (h_inf-h)/tau_h
}
PROCEDURE rates() {
    UNITSOFF
    m_inf = 1/(1+exp(-(v-vhalf_m)/slope_m))
    h_inf = 1/(1+exp((v-vhalf_h)/slope_h))
    UNITSON
}

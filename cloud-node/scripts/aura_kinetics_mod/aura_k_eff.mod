: Original AURA active potassium current, human NWB-constrained only after fit.
: Boltzmann gate and fixed tau are effective assumptions; no claim of
: molecular human Kv channel identification, in vitro voltage clamp or
: reproduced AIS biochemistry.
NEURON {
    SUFFIX aura_k_eff
    USEION k READ ek WRITE ik
    RANGE gbar, vhalf_n, slope_n, tau_n, g, ik
    THREADSAFE
}
UNITS {
    (S) = (siemens)
    (mA) = (milliamp)
    (mV) = (millivolt)
}
PARAMETER {
    gbar = 0.005 (S/cm2)
    vhalf_n = -28 (mV)
    slope_n = 10 (mV)
    tau_n = 1.1 (ms)
}
STATE { n }
ASSIGNED {
    v (mV)
    ek (mV)
    ik (mA/cm2)
    g (S/cm2)
    n_inf
}
BREAKPOINT {
    SOLVE states METHOD cnexp
    g = gbar*n*n*n*n
    ik = g*(v-ek)
}
INITIAL {
    rates()
    n = n_inf
}
DERIVATIVE states {
    rates()
    n' = (n_inf-n)/tau_n
}
PROCEDURE rates() {
    UNITSOFF
    n_inf = 1/(1+exp(-(v-vhalf_n)/slope_n))
    UNITSON
}

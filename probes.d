provider nodeapp {
    probe p1(uint64_t, char*);
    probe p2(uint64_t, char*);
    probe p3(uint64_t, char*);
    probe p4(uint64_t, char*);
    probe p5(uint64_t, char*);
    probe p6(uint64_t, char*);
    probe p7(uint64_t, char*);
    probe p8(uint64_t, char*);
    probe p9(uint64_t, char*);
    probe p10(uint64_t, char*);
    probe probe_enable();
    probe probe_disable();
    probe provider_enabled(char*);
    probe provider_disabled(char*);
    probe generic_probe(char*);
};
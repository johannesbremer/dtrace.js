provider dtrace_provider {
    probe generic_probe(char*);
    probe provider_enabled(char*);
    probe provider_disabled(char*);
};
This project attempts to create a DTrace provider for Node.js. To achieve this, we use a decade-old test suite located in `oldtests/` and the modern Rust project `usdt`, which we access via N-API.

We aim to keep the test suite unchanged, as it is assumed to be correct. Instead, we will adapt the application code — primarily in `build.rs`, `src/lib.rs`, and `dtrace-provider.ts`.

⚠️ Be careful not to modify auto-generated files (as listed in `.gitignore`).

Our goal is to develop a generalized solution — **avoid hardcoding probe names** or anything specific to the test suite.

To build the entire project (including the Rust component), run:

```
pnpm build
```

To execute the full test suite, use:

```
sudo pnpm test
```

Note: System Integrity Protection (SIP) on macOS does **not** interfere with these types of probes.

Since `usdt` uses statically compiled probes, we must ensure they are generated during the build process.

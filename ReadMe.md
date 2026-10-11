# wiki-plugin-commons-machine

A Federated Wiki item that turns a lineup into a computation. Pages declare
typed values in Method items; the machine classifies them into manifest roles,
refuses conflicts and missing roles, lists overrides, evaluates a versioned
formula bundle in exact rational arithmetic (a hand-written parser, no eval),
runs break-even and sweeps, refuses a surplus when the covenant is unmet,
compares the co-op with dated cloud benchmarks, and writes a forkable ghost
scenario page with provenance and a hash of the resolved inputs.

Built for the Compute Commons model — https://model.fedwiki.club/view/compute-commons-plan.

    npm install && npm run build     # client/commons-machine.js
    npm test                          # core against the decimal fixtures (test/expected.json)

Item text commands: `PIN role Title|site/slug`, `SLIDE key min max [step]`,
`SWEEP key v1 v2 …`, `HIDE section…`. See pages/about-commons-machine-plugin.

`src/core/` is plain ESM and runs in node: the conformance target
`targets/compute-commons` in ~/Code/conformance uses it as candidate M2.

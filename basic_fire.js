var d = require('./index');
var provider = d.createDtraceProvider("nodeapp");
var probe = provider.addProbe("p1", ["int", "char *"]);
provider.enable();

// Test basic probe firing
probe.fire();
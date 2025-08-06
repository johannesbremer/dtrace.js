var d = require('./index');
var provider = d.createDtraceProvider("nodeapp");
var probe = provider.addProbe("p1", ["int", "char *"]);
provider.enable();

probe.fire(function(p) {
    return [42, 'forty-two'];
});
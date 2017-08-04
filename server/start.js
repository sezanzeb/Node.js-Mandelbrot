var cluster = require('cluster')
//var numCPUs = require('os').cpus().length
var numCPUs = 1
if (cluster.isMaster)
{
    console.log("starting "+numCPUs+" communicators and buddhabrot calculators")
    for (var i = 0; i < numCPUs*2; i++)
    {
        cluster.fork()
    }
}
else
{
    if(cluster.worker.id%2 == 0)
        require("./buddhabrot.js")
    else
        require("./communicator.js")
}

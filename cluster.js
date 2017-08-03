var cluster = require('cluster')
//var numCPUs = require('os').cpus().length
var numCPUs = 4
if (cluster.isMaster)
{
    console.log("starting 4 processes")
    for (var i = 0; i < numCPUs; i++)
    {
        childId = i
        cluster.fork()
    }
}
else
{
    require("./server.js")
}

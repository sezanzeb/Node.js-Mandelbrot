"use strict"

let fs = require('fs')
let http = require("http")
let jpeg = require("jpeg-js")

function decodeGetParams(url)
{
    url = url.split("?")[1] //get the params without the address

    if(url == undefined)
        return {}

    let strparams = url.split("&") //transform url to an array with all the params

    let params = {}
    let i //iterate over the array with the parameters (each element looks like "asdf=bla")
    for(i = 0;i < strparams.length;i ++) {
        let strparam = strparams[i].split("=")
        params[strparam[0]] = strparam[1]
    }

    return params
}

//function to iterate a point. Good tutorials on how to calculate mandelbrot can be found in the internet
//note that javascript is not able to understand complex numbers.
function iterate(point,mand_iterations)
{
    let zx = point[2]
    let zi = point[3]

    let dist = 0
    let zj = 0

    while(mand_iterations > 0)
    {
        dist = Math.abs(Math.pow(zx,2)+Math.pow(zi,2))
        if(dist > 4)
            break

        mand_iterations -= 1

        zj = zi //store old zi value in zj, because...
        zi = 2*zx*zi + point[1] //...zi is going to be overwritten now...
        zx = zx*zx - zj*zj + point[0] //...but needs to be here for one more calculation
    }

    return {zx,zi,dist}
}

function parseurl(path)
{
    console.log(path)
    //get parameters from the url
    let params = decodeGetParams(path)
    let zoom = parseFloat(params.zoom)
    let minx = parseFloat(params.x)-(1/zoom)
    let maxx = parseFloat(params.x)+(1/zoom)
    let mini = parseFloat(params.y)-(1/zoom)
    let maxi = parseFloat(params.y)+(1/zoom)
    let size = parseInt(params.size) //known as "size" client side
    let width = Math.abs(maxx-minx)
    let height = Math.abs(maxi-mini)
    let id = parseInt(params.id)

    let mb_answer = {
        "maxx":maxx,
        "maxi":maxi,
        "minx":minx,
        "mini":mini,
        "width":width,
        "height":height,
        "zoom":zoom,
        "length":0,
        "requestcount":0,
        "points":[], //points that changed (diverged) go here
        "iterations":20,
        "size":size
    }

    return {mb_answer,size,id}
}

function initializeMB(state,mb_answer)
{
    let width = Math.abs(mb_answer.maxx-mb_answer.minx)
    let height = Math.abs(mb_answer.maxi-mb_answer.mini)
    let stepi = height/mb_answer.size
    let stepx = width/mb_answer.size
    let pointsinuse = 0

    //check if this loop will ever come to an end. An issue that might be the case for very large zoom factors
    if(1-stepx == 1)
        return -1

    state.allPointsC = new Array(mb_answer.size) //contains the counter for buddhabrot e.g [67,132] = 5
    state.allPointsZ = new Array(mb_answer.size) //contains tuples for the logic coordinate system. e.g. [57,142] = [0.12,-0.87]
    state.allPointsB = new Array(mb_answer.size) //iteration of mandelbrot results, means to which point in the logic coordinate system the point moves. e.g. [47,97] = [0.22,-0.76]

    //each item inside answer.points will get a unique identifier
    let pointNr = 0

    //iterate over each point in the visible coordinate system
    //logic position counters
    let ci //is going to be set inside the loop
    let cx = mb_answer.minx

    //indexes
    //px position counters - 1
    let ii = 0
    let ix = 0

    while(cx <= mb_answer.maxx)
    {

        //2D array of all pixels
        state.allPointsC[ix] = new Array(mb_answer.size)
        state.allPointsZ[ix] = new Array(mb_answer.size)
        state.allPointsB[ix] = new Array(mb_answer.size)

        ci = mb_answer.mini
        ii = 0
        while(ci <= mb_answer.maxi)
        {
            //add every point to state.allPoints
            state.allPointsC[ix][ii] = [
                cx, //will remain the same all the time
                ci  //except that point diverges. then undefined will be assigned to it
            ]
            state.allPointsZ[ix][ii] = [
                cx, //this is not redundant. it's zx and zi actually
                ci  //this array tuple is going to be overwritten with iteration results
            ]
            state.allPointsB[ix][ii] = 0 //this is the counter of how many points touched this position
            pointsinuse ++

            //go to next line
            ci += stepi
            ii ++
        }

        //go to next pixel/point
        cx += stepx
        ix ++
    }
    return 1
}

function logicToPxX(x,params)
{
    return(Math.round((x-params.minx)*params.size/params.width))
}

function logicToPxI(i,params)
{
    return(Math.round((i-params.mini)*params.size/params.height))
}

//calculate one mandelbrot iteration
function requestMB(state,mb_answer,pointstosend)
{
    //index inside the array that is being sent to the client
    let divergedPointsCount = 0

    //go through all points, they are initialized in initializeMB()
    let ix //point index + 1 of x-axis
    let ii //point index +1 of imaginary-axis

    let zx //position on x-axis after one mandelbrot iteration
    let zi //position on imaginary-axis after one mandelbrot iteration
    let zj //basically zitmp
    let dist //to check wether or not a point diverged

    for(ix = 0;ix < state.allPointsC.length;ix ++)
    {
        for(ii = 0;ii < state.allPointsC[ix].length;ii ++)
        {
            //only points that did not diverge
            if(state.allPointsC[ix][ii] != undefined)
            {
                zx = state.allPointsZ[ix][ii][0]
                zi = state.allPointsZ[ix][ii][1]

                //check if this point diverged in the recent iteration or not
                //then do a mandelbrot iteration
                //do a few iteration, each time update Buddhabrot values
                let i
                for(i = 0;i < mb_answer.iterations;i++)
                {

                    //mb_answer contains min and width info
                    let pxzx = logicToPxX(zx,mb_answer)
                    let pxzi = logicToPxI(zi,mb_answer)
                    //if this logic point exists within the array
                    if(state.allPointsB[pxzx] != undefined && state.allPointsB[pxzi] != undefined)
                    {
                        state.allPointsB[pxzx][pxzi] = state.allPointsB[pxzx][pxzi] + 1
                    }
                    else
                    {
                        //mark this point as "diverged". The loop will leave out points that are known to diverge
                        state.allPointsC[ix][ii] = undefined
                        break
                    }

                    //then continue and do a iteartion. next time the server will check wether or not this diverges ((sqrt(dist) larger than 2))
                    //allPointsC holds the points from the last requestMB call
                    zj = zi //store old zi value in zj, because...
                    zi = 2*zx*zi + state.allPointsC[ix][ii][1] //...zi is going to be overwritten now...
                    zx = zx*zx - zj*zj + state.allPointsC[ix][ii][0] //...but needs to be here for one more calculation

                }

                //state.allPointsZ holds the information for the server needs to calculate the fractal
                state.allPointsZ[ix][ii][0] = zx //store logic position inside indexed array
                state.allPointsZ[ix][ii][1] = zi //store logic position inside indexed array
            }
        }
    }

    //take slice from state.allPointsC and store it inside mb_answer
    mb_answer.points = state.allPointsB
    mb_answer.length = divergedPointsCount
}

let server = http.createServer(function(request, response)
{
    //understand the request
    let path = request.url
    if(path == "/")
        path = "/index.html"
    console.log("request for "+path)

    //holds the answer that is being sent, in case the client does not want data but rather some file (index.html, style.css, script.js)
    let answer = ""

    //if client requested data
    if (path.indexOf("db.json") != -1)
    {

        //initialize the connection
        console.log("client requesting stream")
        response.writeHead(200, {"Content-Type":"text/event-stream", "Cache-Control":"no-cache", "Connection":"keep-alive"})
        response.write('\n\n');

        //get some parameters, initialize stuff
        let calculateTime = new Date().getTime()
        let parsed = parseurl(path)
        let mb_answer = parsed.mb_answer
        let id = parsed.id
        let state = {}
        state.allPointsC = []
        state.allPointsZ = []
        state.allPointsB = []

        //initialize all the points that are going to be iterated. returns the amount of points
        let zoomfactorvalid = initializeMB(state,mb_answer)
        if(zoomfactorvalid == -1)
        {
            console.log("the zoom factor is too large")
            response.write("id:"+id+"\n")
            response.write("data: zoomfactorinvalid\n\n")
            response.end()
            return
        }

        //as long as the client is active, iterate the points, that initializeMB created
        //this interval writes the stream. It's an interval and not a while loop because it has to be asynchronous and non blocking to some degree
        let interval = null
        let requestcount = 0
        interval = setInterval(function()
        {
            if(request.socket._handle != null)
            {
                //if the client is unable to process all the messages
                if(request.socket._handle.writeQueueSize <= 4)
                {
                    //calculate now
                    requestMB(state,mb_answer)
                    if(mb_answer.points.length > 0)
                    {
                        //send the calculated array
                        mb_answer["requestcount"] = requestcount
                        calculateTime = new Date().getTime()
                        answer = JSON.stringify(mb_answer)
                        storeasimage(mb_answer,id)
                        //mb_answer.points is not needed anymore
                        mb_answer.points = null
                        response.write("id:"+id+"\n")
                        response.write("data:"+answer+"\n\n")

                        mb_answer.points = [] //reset the array after answer has been sent
                        requestcount ++
                    }
                    else
                    {
                        //if no point has been found within 5 seconds, close the stream
                        if(new Date().getTime() - calculateTime > 1000)
                        {
                            clearInterval(interval);
                            console.log("no more points found timeout for stream id: "+id)
                            //free up memory
                            state = {}
                            mb_answer = {}
                            response.end()
                        }
                    }
                }
                else
                {
                    clearInterval(interval);
                    console.log("closed because writeQueueSize is too lage; stream id: "+id)
                    //free up memory
                    state = {}
                    mb_answer = {}
                    response.end()
                }
            }
            else
            {
                clearInterval(interval);
                console.log("closed because _handle is null; stream id: "+id)
                //free up memory
                state = {}
                mb_answer = {}
                response.end()
            }
        },1)

        request.connection.addListener("close", function ()
        {
              clearInterval(interval);
              console.log("client closed stream id: "+id)
              //free up memory
              state = {}
              mb_answer = {}
              response.end()
        }, false);
        return 0
    }
    else
    {
        //you should use asynchronous file reads in nodejs for actual webservices in production
        if(path.indexOf("/db.json") != 0)
        {
            if (fs.existsSync("public"+path)) {
                let html = fs.readFileSync("public"+path,"utf-8").toString()
                response.writeHead(200, {"Content-Type": "text/html"})
                answer = html
            }
        }

        //send answer to client
        //this covers mandelbrot points as well as index.html, style.css and script.js
        response.write(answer)
        response.end()
    }
})

function storeasimage(mb_answer,id)
{

    let decodedBmpData = ""
    let v
    let width = mb_answer.points.length
    let height = mb_answer.points[0].length

    //create new img
    for(let x = 0;x < width;x++)
    {
        for(let y = 0;y < height;y++)
        {
            v = mb_answer.points[x][y]
            v = parseInt(Math.tanh(v/1000)*255).toString(16).toUpperCase()
            if(v.length == 1)
                v = "0" + v
            v = v + v + v //RGB
            decodedBmpData += v + "FF"
        }
    }

    var newimg = {
        "data": new Buffer(decodedBmpData,"hex"),
        "width": width,
        "height": height
    }
    //create new bmp from that
    var newimgraw = jpeg.encode(newimg) //encoded, that means the weird character sequences again

    //store bmp
    /*fs.writeFile("out"+id+".jpg", newimgraw.data, function(err) {
        if(err) return console.log(err)
        console.log("The file was saved!");
    });*/

    mb_answer["image"] = new Buffer(newimgraw.data).toString('base64')
}

function readcompressedimage()
{
    let base64buddhabrot = "";
    return base64buddhabrot
}

//wait for requests
let port = 4000
server.listen(port)
console.log("listening on port "+port+"...")

































//

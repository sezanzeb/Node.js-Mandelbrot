"use strict"

let http = require("http")
let bmp = require("bmp-js")

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
    log(path)
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
        "image":"",
        "requestcount":0
    }

    let state = {
        "maxx":maxx,
        "maxi":maxi,
        "minx":minx,
        "mini":mini,
        "width":width,
        "height":height,
        "zoom":zoom,
        "length":0,
        "requestcount":0,
        "iterations":20,
        "size":size
    }

    return {mb_answer,size,id,state}
}

//create the arrays and stuff for the calculation
function initializeMB(state,mb_answer)
{
    let width = Math.abs(state.maxx-state.minx)
    let height = Math.abs(state.maxi-state.mini)
    let stepi = height/state.size
    let stepx = width/state.size
    let pointsinuse = 0

    //check if this loop will ever come to an end. An issue that might be the case for very large zoom factors
    if(1-stepx == 1)
        return -1

    state.allPointsC = new Array(state.size) //contains the counter for buddhabrot e.g [67,132] = 5
    state.allPointsZ = new Array(state.size) //contains tuples for the logic coordinate system. e.g. [57,142] = [0.12,-0.87]
    state.allPointsB = new Array(state.size) //iteration of mandelbrot results, means to which point in the logic coordinate system the point moves. e.g. [47,97] = [0.22,-0.76]

    //each item inside answer.points will get a unique identifier
    let pointNr = 0

    //iterate over each point in the visible coordinate system
    //logic position counters
    let ci //is going to be set inside the loop
    let cx = state.minx

    //indexes
    //px position counters - 1
    let ii = 0
    let ix = 0

    while(cx <= state.maxx)
    {

        //2D array of all pixels
        state.allPointsC[ix] = new Array(state.size)
        state.allPointsZ[ix] = new Array(state.size)
        state.allPointsB[ix] = new Array(state.size)

        ci = state.mini
        ii = 0
        while(ci <= state.maxi)
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

//prevents aliasing. As the z values (x and i in this case) hold very accurate information
//interpolation is possible, because the z values are "inbetween" pixels because they are so accurate
//no supersubsampling needed therefore
function interpolateBuddhacounter(x,i,state)
{
    //convert to px coordinate system, but don't round it
    x = (x-state.minx)*state.size/state.width
    i = (i-state.mini)*state.size/state.height

    //increment state.allPointsB according to interpolation
    let x_ri = Math.ceil(x)
    let i_up = Math.ceil(i)
    let x_le = Math.floor(x)
    let i_do = Math.floor(i)

    //those 4 integers represent the boundaries of the 4 pixels that need to be interpolated

    //now get the weights. it's the rectangle area between the point x,i and the edge
    //make sure it's positive and substract it from one, because large area means x,i is far away from that edge
    let w00 = 1-Math.abs((x_le-x) * (i_do-i))
    let w01 = 1-Math.abs((x_le-x) * (i_up-i))
    let w10 = 1-Math.abs((x_ri-x) * (i_do-i))
    let w11 = 1-Math.abs((x_ri-x) * (i_up-i))

    //now add the weights from the positions in state.allPointsB
    //the indices might not exist, that's why try catch

    if(trytoadd(state,x_ri,i_up,w11) == 1)
    if(trytoadd(state,x_ri,i_do,w10) == 1)
    if(trytoadd(state,x_le,i_up,w01) == 1)
    if(trytoadd(state,x_le,i_do,w00) == 1)
        return 1

    return -1
}

//if it interpolates over the boundaries of the 2D array for the pixelated information, break
function trytoadd(state,x,i,w)
{
    if(state.allPointsB[x] != undefined && state.allPointsB[x][i] != undefined)
    {
        state.allPointsB[x][i] += w
        return 1
    }
    return -1
}

//calculate one mandelbrot iteration. I could ofcourse aswell just calculate all at once but
//the nice thing about this software is that it builds up on the screen. so this function will be called a few times
//and then the result will be written to the client
function requestMB(state,mb_answer,pointstosend)
{
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
                for(i = 0;i < state.iterations;i++)
                {

                    //mb_answer contains min and width info
                    if(interpolateBuddhacounter(zx,zi,state) == -1)
                    {
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
}

//create the server that sends the buddhabrot data to the client
let server = http.createServer(function(request, response)
{
    //understand the request
    let path = request.url

    //holds the answer that is being sent, in case the client does not want data but rather some file (index.html, style.css, script.js)
    let answer = ""

    //initialize the connection
    log("communicator requesting stream")
    response.writeHead(200, {"Content-Type":"text/event-stream", "Cache-Control":"no-cache", "Connection":"keep-alive"})
    response.write('\n\n');

    //get some parameters, initialize stuff
    let parsed = parseurl(path)
    let mb_answer = parsed.mb_answer
    let id = parsed.id
    let state = parsed.state
    state.allPointsC = []
    state.allPointsZ = []
    state.allPointsB = []

    //initialize all the points that are going to be iterated. returns the amount of points
    let zoomfactorvalid = initializeMB(state,mb_answer)
    if(zoomfactorvalid == -1)
    {
        log("the zoom factor is too large")
        response.write("data: zoomfactorinvalid\n\n")
        response.end()
        return
    }

    //as long as the client is active, iterate the points, that initializeMB created
    //this interval writes the stream. It's an interval and not a while loop because it has to be asynchronous and non blocking to some degree
    let interval = null
    let requestcount = 0

    //interval because it has to send the data again and again
    let running = true;
    while(running)
    {
        if(request.socket._handle != null)
        {
            //if the client is unable to process all the messages
            if(request.socket._handle.writeQueueSize <= 10)
            {
                //calculate now. The result of this call is, that in state the arrays are updated
                requestMB(state,mb_answer)

                if(requestcount%5 == 0 && requestcount != 0)
                    log("iterations: "+requestcount)

                //some statistical stuff
                mb_answer.requestcount = requestcount

                /*//now from the info in state, calculate the image and store it inside mb_answer
                //store it as image and not as array in mb_answer because sending so much data at once is a very large bottleneck
                //unfortunatelly encoding the image is a bottleneck aswell
                storeasimage(state,mb_answer,id)*/
                mb_answer.allPointsB = state.allPointsB
                //stringify the answer so that it can be sent to the client
                mb_answer.id = id
                answer = JSON.stringify(mb_answer)

                //write
                response.write("data:"+answer+"\n\n")

                //some statistical stuff
                requestcount ++
            }
            else
            {
                running = false
                log("closed because writeQueueSize is too lage; stream id: "+id)
                //free up memory
                state = {}
                mb_answer = {}
                response.end()
            }
        }
        else
        {
            running = false
            log("closed because _handle is null; stream id: "+id)
            //free up memory
            state = {}
            mb_answer = {}
            response.end()
        }
    }

    request.connection.addListener("close", function ()
    {
        running = false
        log("communicator closed stream id: "+id)
        //free up memory
        state = {}
        mb_answer = {}
        response.end()
    }, false);
    return 0
})

function log(msg)
{
    console.log("[bud]: " + msg)
}

//wait for requests
let port = 4000
server.listen(port)
log("listening on port "+port+"...")

































//





























//

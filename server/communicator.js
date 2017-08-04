"use strict"

let fs = require('fs')
let http = require("http")
let bmp = require("bmp-js")
let request = require("request")

//create the server that sends the buddhabrot data to the client
let server = http.createServer(function(clientrequest, clientresponse)
{
    let id = Math.round(Math.random()*10000)
    //understand the request
    let path = clientrequest.url
    if(path == "/")
        path = "/index.html"
    log("request for "+path)

    //holds the answer that is being sent, in case the client does not want data but rather some file (index.html, style.css, script.js)
    let answer = ""

    let status = "stopped"
    //if client requested data
    if (path.indexOf("db.json") != -1)
    {

        //initialize the connection
        log("client requesting bmp stream")
        clientresponse.writeHead(200, {"Content-Type":"text/event-stream", "Cache-Control":"no-cache", "Connection":"keep-alive"})
        clientresponse.write('\n\n');

        //TODO send the requesturl to port 4000 for calculation

        //TODO take the answer from port 4000 (the array of points) and calculate the image from it
        //store the image inside mb_answer

        //TODO then send it as it is to the client

        //as long as the client is active, iterate the points, that initializeMB created
        //this interval writes the stream. It's an interval and not a while loop because it has to be asynchronous and non blocking to some degree
        let interval = null
        let requestcount = 0

        interval = setTimeout(function()
        {
            if(clientrequest.socket._handle != null)
            {
                //if the client is unable to process all the messages
                if(clientrequest.socket._handle.writeQueueSize <= 4)
                {
                    //request from port 4000 as stream
                    let completemessage = ""
                    log("opening stream for client. id: "+id)
                    let buddharesponse
                    request.get("http://www.localhost:4000" + path).on("response", (buddharesponsetmp) =>
                    {
                        buddharesponse = buddharesponsetmp
                        log("stream status from buddha: "+buddharesponse.statusCode)
                        if(buddharesponse.statusCode == 200)
                            status = "running"
                    })
                    .on('data', (data) => {

                        if(status == "stopped")
                        {
                            log("trying to stop buddha")
                            buddharesponse.destroy()
                            return
                        }

                        //convert the data buffer to a string
                        let stringdata = data.toString()

                        //check if the message is complete
                        if(stringdata[stringdata.length-3] != "}")
                        {
                            //data not complete yet
                            completemessage += stringdata
                        }
                        else
                        {
                            //if the stringdata ends with } that means that's the missing chunk of data
                            completemessage += stringdata
                            //remove "data:" from the front
                            completemessage = completemessage.split("data:")[1]

                            let mb_answer = JSON.parse(completemessage) //restore mb_answer
                            storeasimage(mb_answer) //calculate the image from the points
                            mb_answer.points = null //remove the points from mb_answer
                            answer = JSON.stringify(mb_answer) //pack answer
                            clientresponse.write("data: " + answer + "\n\n") //send the processed mb_answer

                            //reset this temporary memory of incomplete messages
                            completemessage = "";
                        }

                    }).on('error', (err) => { log(err) })
                }
                else
                {
                    status = "stopped"
                    clearInterval(interval);
                    log("closed because writeQueueSize is too lage; stream id: "+id)
                    clientresponse.end()
                }
            }
            else
            {
                status = "stopped"
                clearInterval(interval);
                log("closed because _handle is null; stream id: "+id)
                clientresponse.end()
            }
        },1)

        clientrequest.connection.addListener("close", function ()
        {
            status = "stopped"
            clearInterval(interval)
            log("client closed stream id: "+id)
            clientresponse.end()
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
                clientresponse.writeHead(200, {"Content-Type": "text/html"})
                answer = html
            }
        }

        //send answer to client
        //this covers mandelbrot points as well as index.html, style.css and script.js
        clientresponse.write(answer)
        clientresponse.end()
    }
})

function log(msg)
{
    console.log("[com]: " + msg)
}

function stop()
{
    //TODO tell port 4000 to stop calculating images
}

function storeasimage(mb_answer)
{

    //in this variable the colors will be concatinated in hexadecimal style
    let decodedBmpData = ""

    //variables that will hold the colors to concatinate
    let v,r,g,b

    //Some information for the encoder
    let width = mb_answer.allPointsB.length
    let height = mb_answer.allPointsB[0].length

    //stretch means stretch on the v-axis (value of the BuddhabrotCounter).
    //Higher stretch means darker image for low counter values but will also prevent clipping
    //(clipping is already kinda countered by using the tanh curve which converges to 1 but never really touches it)
    let stretch = 10000;

    //create new img
    for(let x = 0;x < width;x++)
    {
        for(let y = 0;y < height;y++)
        {
            //get the value that the colors are based on
            v = mb_answer.allPointsB[x][y]

            //step one: calculate r g b colors from v
            r = Math.pow(Math.tanh(v/stretch),2)*255*0.8
            g = Math.pow(Math.tanh(v/stretch),1)*255
            b = Math.pow(Math.tanh(v/stretch),0.5)*255*0.9+25

            //step two: convert it to hexadecimal
            r = parseInt(r).toString(16).toUpperCase()
            g = parseInt(g).toString(16).toUpperCase()
            b = parseInt(b).toString(16).toUpperCase()
            if(r.length == 1) r = "0" + r
            if(g.length == 1) g = "0" + g
            if(b.length == 1) b = "0" + b

            //concatinate
            v = r + g + b //RGB
            decodedBmpData += v + "FF" //this string will get longer and longer. FF needs to be added for whatever reason
        }
    }

    //now create the DEcoded image
    var newimg = {
        "data": new Buffer(decodedBmpData,"hex"),
        "width": width,
        "height": height
    }
    //and ENcode a new bmp from that
    var newimgraw = bmp.encode(newimg) //encoded, that means the weird character sequences again

    //store bmp
    /*fs.writeFile("out"+id+".jpg", newimgraw.data, function(err) {
        if(err) return log(err)
        log("The file was saved!");
    });*/

    //write that image as base64 to the mb_answer object
    mb_answer.image = new Buffer(newimgraw.data).toString('base64')
}

//wait for requests
let port = 4001
server.listen(port)
log("communicator/converter ready")
log("listening on port "+port+" for browser requests...")

































//

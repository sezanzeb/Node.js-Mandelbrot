
# Node.js-Buddhabrot
- client requests website at localhost:4001
- 4001 sends the website html data
- 4001 requests the buddhabrot raw data at 4000 (which is another process spawned by "cluster")
- 4000 starts streaming raw data (which is interpolated and aliasing free) to 4001
- as data arrives at 4001, 4001 encodes the data to base64 bmp files. In the meantime 4000 continues to calculate the next raw data cunk
- 4001 streams the bmp files to the client
- client displays the newly arrived bmp

## installation

      npm install
      npm start
      #then open Firefox or Chromium and visit localhost:4001

![Screenshot](https://github.com/sezanzeb/Node.js-Mandelbrot/blob/Buddhabrot/buddhabrot.png)

Comfortaa-Regular.ttf: Copyright 2011 The Comfortaa Project Authors (aajohan@gmail.com), with Reserved Font Name "Comfortaa".



const Prometheus = require('prom-client')
const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const {generateMessage, generateLocationMessage} = require('./utils/message');
const {isRealString} = require('./utils/validation');
const {Users} = require('./utils/users');

const publicPath = path.join(__dirname, '../public');
const port = process.env.PORT || 5050;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var users = new Users();

app.use(express.static(publicPath));


const metricsInterval = Prometheus.collectDefaultMetrics()
const httpRequestDurationMicroseconds = new Prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.10, 5, 15, 50, 100, 200, 300, 400, 500]  // buckets for response time from 0.1ms to 500ms
})


// Metrics endpoint
 app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType)
  res.end(Prometheus.register.metrics())
})


io.on('connection', (socket) => {
  console.log('New user connected');

  socket.on('join', (params, callback) => {
    if (!isRealString(params.name) || !isRealString(params.room)){
      callback('Name and room name are required');
    }

    socket.join(params.room);
    users.removeUser(socket.id);
    users.addUser(socket.id, params.name, params.room);

    io.to(params.room).emit('updateUserList', users.getUserList(params.room));

    socket.emit('newMessage', generateMessage('Admin', 'Welcome to Zootopia Chat App'));
    socket.broadcast.to(params.room).emit('newMessage', generateMessage('Admin', `A new Zootopian ${params.name} has joined!`));
    callback();
  });

  socket.on('createMessage', (message, callback) => {
    var user = users.getUser(socket.id);

    if(user && isRealString(message.text)){
      io.to(user.room).emit('newMessage', generateMessage(user.name, message.text));
    }

    callback();
    });

    socket.on('createLocationMessage', (coords) => {
      var user = users.getUser(socket.id);
      if(user){
      io.emit('newLocationMessage', generateLocationMessage(user.name, coords.latitude, coords.longitude));
    }
    });

  socket.on('disconnect', () => {
    var user = users.removeUser(socket.id);

    if(user){
      io.to(user.room).emit('updateUserList', users.getUserList(user.room));
      io.to(user.room).emit('newMessage', generateMessage('Admin', `${user.name} has left`));
    }
  });
});

server.listen(port, () => {
  console.log(`Server is up on port ${port}`);
});

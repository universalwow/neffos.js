"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// START HACK.
//
// Some "hacks" I found myself to make it compatible to run with browser and inside nodejs
// the good thing is that the node's WebSocket module has the same API as the browser's one,
// so all works and minimum changes were required to achieve that result.
// See the `genWait()` too.
const isBrowser = (typeof window !== 'undefined');
var WebSocket;
if (!isBrowser) {
    WebSocket = require('ws');
}
else {
    WebSocket = window["WebSocket"];
}
exports.OnNamespaceConnect = "_OnNamespaceConnect";
exports.OnNamespaceConnected = "_OnNamespaceConnected";
exports.OnNamespaceDisconnect = "_OnNamespaceDisconnect";
exports.OnRoomJoin = "_OnRoomJoin";
exports.OnRoomJoined = "_OnRoomJoined";
exports.OnRoomLeave = "_OnRoomLeave";
exports.OnRoomLeft = "_OnRoomLeft";
exports.OnAnyEvent = "_OnAnyEvent";
exports.OnNativeMessage = "_OnNativeMessage";
const ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
// see `handleAck`.
const ackIDBinary = 'A'; // comes from server to client after ackBinary and ready as a prefix, the rest message is the conn's ID.
const ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnected` errored as a prefix, the rest message is the error text.
const waitIsConfirmationPrefix = '#';
const waitComesFromClientPrefix = '$';
function IsSystemEvent(event) {
    switch (event) {
        case exports.OnNamespaceConnect:
        case exports.OnNamespaceConnected:
        case exports.OnNamespaceDisconnect:
        case exports.OnRoomJoin:
        case exports.OnRoomJoined:
        case exports.OnRoomLeave:
        case exports.OnRoomLeft:
            return true;
        default:
            return false;
    }
}
exports.IsSystemEvent = IsSystemEvent;
function isEmpty(s) {
    if (s === undefined) {
        return true;
    }
    if (s === null) {
        return true;
    }
    if (typeof s === 'string' || s instanceof String) {
        return s.length === 0 || s === "";
    }
    if (s instanceof Error) {
        return isEmpty(s.message);
    }
    return false;
}
class Message {
    isConnect() {
        return this.Event == exports.OnNamespaceConnect || false;
    }
    isDisconnect() {
        return this.Event == exports.OnNamespaceDisconnect || false;
    }
    isRoomJoin() {
        return this.Event == exports.OnRoomJoin || false;
    }
    isRoomLeft() {
        return this.Event == exports.OnRoomLeft || false;
    }
    isWait() {
        if (isEmpty(this.wait)) {
            return false;
        }
        if (this.wait[0] == waitIsConfirmationPrefix) {
            return true;
        }
        return this.wait[0] == waitComesFromClientPrefix || false;
    }
}
exports.Message = Message;
const messageSeparator = ';';
const validMessageSepCount = 7;
const trueString = "1";
const falseString = "0";
function serializeMessage(msg) {
    if (msg.IsNative && isEmpty(msg.wait)) {
        return msg.Body;
    }
    let isErrorString = falseString;
    let isNoOpString = falseString;
    let body = msg.Body || "";
    if (msg.isError) {
        body = msg.Err;
        isErrorString = trueString;
    }
    if (msg.isNoOp) {
        isNoOpString = trueString;
    }
    return [
        msg.wait || "",
        msg.Namespace,
        msg.Room || "",
        msg.Event || "",
        isErrorString,
        isNoOpString,
        body
    ].join(messageSeparator);
}
// <wait>;
// <namespace>;
// <room>;
// <event>;
// <isError(0-1)>;
// <isNoOp(0-1)>;
// <body||error_message>
function deserializeMessage(data, allowNativeMessages) {
    var msg = new Message();
    if (data.length == 0) {
        msg.isInvalid = true;
        return msg;
    }
    let dts = data.split(messageSeparator, validMessageSepCount);
    if (dts.length != validMessageSepCount) {
        if (!allowNativeMessages) {
            msg.isInvalid = true;
        }
        else {
            msg.Event = exports.OnNativeMessage;
            msg.Body = data;
        }
        return msg;
    }
    msg.wait = dts[0];
    msg.Namespace = dts[1];
    msg.Room = dts[2];
    msg.Event = dts[3];
    msg.isError = dts[4] == trueString || false;
    msg.isNoOp = dts[5] == trueString || false;
    let body = dts[6];
    if (!isEmpty(body)) {
        if (msg.isError) {
            msg.Err = body;
        }
        else {
            msg.Body = body;
        }
    }
    else {
        msg.Body = "";
    }
    msg.isInvalid = false;
    msg.IsForced = false;
    msg.IsLocal = false;
    msg.IsNative = (allowNativeMessages && msg.Event == exports.OnNativeMessage) || false;
    // msg.SetBinary = false;
    return msg;
}
function genWait() {
    if (!isBrowser) {
        let hrTime = process.hrtime();
        return waitComesFromClientPrefix + hrTime[0] * 1000000000 + hrTime[1];
    }
    else {
        let now = window.performance.now();
        return waitComesFromClientPrefix + now.toString();
    }
}
function genWaitConfirmation(wait) {
    return waitIsConfirmationPrefix + wait;
}
function genEmptyReplyToWait(wait) {
    return wait + messageSeparator.repeat(validMessageSepCount - 1);
}
class Room {
    constructor(ns, roomName) {
        this.nsConn = ns;
        this.name = roomName;
    }
    Emit(event, body) {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        return this.nsConn.conn.Write(msg);
    }
    Leave() {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = exports.OnRoomLeave;
        return this.nsConn.askRoomLeave(msg);
    }
}
exports.Room = Room;
class NSConn {
    constructor(conn, namespace, events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map();
    }
    Emit(event, body) {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.Write(msg);
    }
    Ask(event, body) {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.Ask(msg);
    }
    JoinRoom(roomName) {
        return this.askRoomJoin(roomName);
    }
    Room(roomName) {
        return this.rooms.get(roomName);
    }
    Rooms() {
        let rooms = new Array(this.rooms.size);
        this.rooms.forEach((room) => {
            rooms.push(room);
        });
        return rooms;
    }
    LeaveAll() {
        return __awaiter(this, void 0, void 0, function* () {
            let leaveMsg = new Message();
            leaveMsg.Namespace = this.namespace;
            leaveMsg.Event = exports.OnRoomLeft;
            leaveMsg.IsLocal = true;
            this.rooms.forEach((value, roomName) => __awaiter(this, void 0, void 0, function* () {
                leaveMsg.Room = roomName;
                try {
                    yield this.askRoomLeave(leaveMsg);
                }
                catch (err) {
                    return err;
                }
            }));
            return null;
        });
    }
    forceLeaveAll(isLocal) {
        let leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = exports.OnRoomLeave;
        leaveMsg.IsForced = true;
        leaveMsg.IsLocal = isLocal;
        this.rooms.forEach((value, roomName) => {
            leaveMsg.Room = roomName;
            fireEvent(this, leaveMsg);
            this.rooms.delete(roomName);
            leaveMsg.Event = exports.OnRoomLeft;
            fireEvent(this, leaveMsg);
            leaveMsg.Event = exports.OnRoomLeave;
        });
    }
    Disconnect() {
        let disconnectMsg = new Message();
        disconnectMsg.Namespace = this.namespace;
        disconnectMsg.Event = exports.OnNamespaceDisconnect;
        return this.conn.askDisconnect(disconnectMsg);
    }
    askRoomJoin(roomName) {
        return __awaiter(this, void 0, void 0, function* () {
            let room = this.rooms.get(roomName);
            if (room !== undefined) {
                return room;
            }
            let joinMsg = new Message();
            joinMsg.Namespace = this.namespace;
            joinMsg.Room = roomName;
            joinMsg.Event = exports.OnRoomJoin;
            joinMsg.IsLocal = true;
            try {
                yield this.conn.Ask(joinMsg);
            }
            catch (err) {
                return err;
            }
            let err = fireEvent(this, joinMsg);
            if (!isEmpty(err)) {
                return err;
            }
            room = new Room(this, roomName);
            this.rooms.set(roomName, room);
            joinMsg.Event = exports.OnRoomJoined;
            fireEvent(this, joinMsg);
            return room;
        });
    }
    askRoomLeave(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.rooms.has(msg.Room)) {
                return exports.ErrBadRoom;
            }
            try {
                yield this.conn.Ask(msg);
            }
            catch (err) {
                return err;
            }
            let err = fireEvent(this, msg);
            if (!isEmpty(err)) {
                return err;
            }
            this.rooms.delete(msg.Room);
            msg.Event = exports.OnRoomLeft;
            fireEvent(this, msg);
            return null;
        });
    }
    replyRoomJoin(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        if (!this.rooms.has(msg.Room)) {
            let err = fireEvent(this, msg);
            if (!isEmpty(err)) {
                msg.Err = err.message;
                this.conn.Write(msg);
                return;
            }
            this.rooms.set(msg.Room, new Room(this, msg.Room));
            msg.Event = exports.OnRoomJoined;
            fireEvent(this, msg);
        }
        this.conn.writeEmptyReply(msg.wait);
    }
    replyRoomLeave(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        if (!this.rooms.has(msg.Room)) {
            this.conn.writeEmptyReply(msg.wait);
            return;
        }
        fireEvent(this, msg);
        this.rooms.delete(msg.Room);
        this.conn.writeEmptyReply(msg.wait);
        msg.Event = exports.OnRoomLeft;
        fireEvent(this, msg);
    }
}
exports.NSConn = NSConn;
function fireEvent(ns, msg) {
    if (ns.events.hasOwnProperty(msg.Event)) {
        return ns.events[msg.Event](ns, msg);
    }
    if (ns.events.hasOwnProperty(exports.OnAnyEvent)) {
        return ns.events[exports.OnAnyEvent](ns, msg);
    }
    return null;
}
function getEvents(namespaces, namespace) {
    if (namespaces.hasOwnProperty(namespace)) {
        return namespaces[namespace];
    }
    return null;
}
exports.ErrInvalidPayload = new Error("invalid payload");
exports.ErrBadNamespace = new Error("bad namespace");
exports.ErrBadRoom = new Error("bad room");
exports.ErrClosed = new Error("use of closed connection");
exports.ErrWrite = new Error("write closed");
function Dial(endpoint, connHandler, protocols) {
    if (endpoint.indexOf("ws") == -1) {
        endpoint = "ws://" + endpoint;
    }
    return new Promise((resolve, reject) => {
        if (!WebSocket) {
            reject("WebSocket is not accessible through this browser.");
        }
        if (connHandler === undefined) {
            reject("connHandler is empty.");
        }
        let ws = new WebSocket(endpoint, protocols);
        let conn = new Conn(ws, connHandler, protocols);
        ws.binaryType = "arraybuffer";
        ws.onmessage = ((evt) => {
            let err = conn.handle(evt);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }
            if (conn.IsAcknowledged()) {
                resolve(conn);
            }
        });
        ws.onopen = ((evt) => {
            // let b = new Uint8Array(1)
            // b[0] = 1;
            // this.conn.send(b.buffer);
            ws.send(ackBinary);
        });
        ws.onerror = ((err) => {
            conn.Close();
            reject(err);
        });
    });
}
exports.Dial = Dial;
class Conn {
    // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.
    constructor(conn, connHandler, protocols) {
        this.conn = conn;
        this.isAcknowledged = false;
        let hasEmptyNS = connHandler.hasOwnProperty("");
        this.allowNativeMessages = hasEmptyNS && connHandler[""].hasOwnProperty(exports.OnNativeMessage);
        this.queue = new Array();
        this.waitingMessages = new Map();
        this.namespaces = connHandler;
        this.connectedNamespaces = new Map();
        // this.isConnectingProcesseses = new Array<string>();
        this.closed = false;
        this.conn.onclose = ((evt) => {
            this.Close();
            return null;
        });
    }
    IsAcknowledged() {
        return this.isAcknowledged;
    }
    handle(evt) {
        if (!this.isAcknowledged) {
            // if (evt.data instanceof ArrayBuffer) {
            // new Uint8Array(evt.data)
            let err = this.handleAck(evt.data);
            if (err == undefined) {
                this.isAcknowledged = true;
                this.handleQueue();
            }
            else {
                this.conn.close();
            }
            return err;
        }
        return this.handleMessage(evt.data);
    }
    handleAck(data) {
        let typ = data[0];
        switch (typ) {
            case ackIDBinary:
                // let id = dec.decode(data.slice(1));
                let id = data.slice(1);
                this.ID = id;
                break;
            case ackNotOKBinary:
                // let errorText = dec.decode(data.slice(1));
                let errorText = data.slice(1);
                return new Error(errorText);
            default:
                this.queue.push(data);
                return null;
        }
    }
    handleQueue() {
        if (this.queue == undefined || this.queue.length == 0) {
            return;
        }
        this.queue.forEach((item, index) => {
            this.queue.splice(index, 1);
            this.handleMessage(item);
        });
    }
    handleMessage(data) {
        let msg = deserializeMessage(data, this.allowNativeMessages);
        if (msg.isInvalid) {
            return exports.ErrInvalidPayload;
        }
        if (msg.IsNative && this.allowNativeMessages) {
            let ns = this.Namespace("");
            return fireEvent(ns, msg);
        }
        if (msg.isWait()) {
            let cb = this.waitingMessages.get(msg.wait);
            if (cb != undefined) {
                cb(msg);
                return;
            }
        }
        const ns = this.Namespace(msg.Namespace);
        switch (msg.Event) {
            case exports.OnNamespaceConnect:
                this.replyConnect(msg);
                break;
            case exports.OnNamespaceDisconnect:
                this.replyDisconnect(msg);
                break;
            case exports.OnRoomJoin:
                if (ns !== undefined) {
                    ns.replyRoomJoin(msg);
                    break;
                }
            case exports.OnRoomLeave:
                if (ns !== undefined) {
                    ns.replyRoomLeave(msg);
                    break;
                }
            default:
                // this.checkWaitForNamespace(msg.Namespace);
                if (ns === undefined) {
                    return exports.ErrBadNamespace;
                }
                msg.IsLocal = false;
                let err = fireEvent(ns, msg);
                if (!isEmpty(err)) {
                    // write any error back to the server.
                    msg.Err = err.message;
                    this.Write(msg);
                    return err;
                }
        }
        return null;
    }
    Connect(namespace) {
        return this.askConnect(namespace);
    }
    Namespace(namespace) {
        return this.connectedNamespaces.get(namespace);
    }
    replyConnect(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        let ns = this.Namespace(msg.Namespace);
        if (ns !== undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }
        let events = getEvents(this.namespaces, msg.Namespace);
        if (events === undefined) {
            msg.Err = exports.ErrBadNamespace.message;
            this.Write(msg);
            return;
        }
        ns = new NSConn(this, msg.Namespace, events);
        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);
        msg.Event = exports.OnNamespaceConnected;
        fireEvent(ns, msg);
    }
    replyDisconnect(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        let ns = this.Namespace(msg.Namespace);
        if (ns === undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }
        ns.forceLeaveAll(true);
        this.connectedNamespaces.delete(msg.Namespace);
        this.writeEmptyReply(msg.wait);
        fireEvent(ns, msg);
    }
    Ask(msg) {
        return new Promise((resolve, reject) => {
            if (this.IsClosed()) {
                reject(exports.ErrClosed);
                return;
            }
            msg.wait = genWait();
            this.waitingMessages.set(msg.wait, ((receive) => {
                if (receive.isError) {
                    reject(new Error(receive.Err));
                    return;
                }
                resolve(receive);
            }));
            if (!this.Write(msg)) {
                reject(exports.ErrWrite);
                return;
            }
        });
    }
    // private addConnectProcess(namespace: string) {
    //     this.isConnectingProcesseses.push(namespace);
    // }
    // private removeConnectProcess(namespace: string) {
    //     let idx = this.isConnectingProcesseses.findIndex((value: string, index: number, obj) => { return value === namespace || false; });
    //     if (idx !== -1) {
    //         this.isConnectingProcesseses.splice(idx, 1);
    //     }
    // }
    askConnect(namespace) {
        return __awaiter(this, void 0, void 0, function* () {
            let ns = this.Namespace(namespace);
            if (ns !== undefined) { // it's already connected.
                return ns;
            }
            let events = getEvents(this.namespaces, namespace);
            if (events === undefined) {
                return exports.ErrBadNamespace;
            }
            // this.addConnectProcess(namespace);
            let connectMessage = new Message();
            connectMessage.Namespace = namespace;
            connectMessage.Event = exports.OnNamespaceConnect;
            connectMessage.IsLocal = true;
            ns = new NSConn(this, namespace, events);
            let err = fireEvent(ns, connectMessage);
            if (!isEmpty(err)) {
                // this.removeConnectProcess(namespace);
                return err;
            }
            try {
                yield this.Ask(connectMessage);
            }
            catch (err) {
                return err;
            }
            this.connectedNamespaces.set(namespace, ns);
            connectMessage.Event = exports.OnNamespaceConnected;
            fireEvent(ns, connectMessage);
            // this.removeConnectProcess(namespace);
            return ns;
        });
    }
    askDisconnect(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let ns = this.Namespace(msg.Namespace);
            if (ns === undefined) { // it's already connected.
                return exports.ErrBadNamespace;
            }
            try {
                yield this.Ask(msg);
            }
            catch (err) {
                return err;
            }
            ns.forceLeaveAll(true);
            this.connectedNamespaces.delete(msg.Namespace);
            msg.IsLocal = true;
            return fireEvent(ns, msg);
        });
    }
    IsClosed() {
        return this.closed || this.conn.readyState == this.conn.CLOSED || false;
    }
    Write(msg) {
        if (this.IsClosed()) {
            return false;
        }
        if (!msg.isConnect() && !msg.isDisconnect()) {
            // namespace pre-write check.
            let ns = this.Namespace(msg.Namespace);
            if (ns === undefined) {
                return false;
            }
            // room per-write check.
            if (!isEmpty(msg.Room) && !msg.isRoomJoin() && !msg.isRoomLeft()) {
                if (!ns.rooms.has(msg.Room)) {
                    // tried to send to a not joined room.
                    return false;
                }
            }
        }
        this.write(serializeMessage(msg));
        return true;
    }
    write(data) {
        this.conn.send(data);
    }
    writeEmptyReply(wait) {
        this.write(genEmptyReplyToWait(wait));
    }
    Close() {
        if (this.closed) {
            return;
        }
        let disconnectMsg = new Message();
        disconnectMsg.Event = exports.OnNamespaceDisconnect;
        disconnectMsg.IsForced = true;
        disconnectMsg.IsLocal = true;
        this.connectedNamespaces.forEach((ns) => {
            ns.forceLeaveAll(true);
            disconnectMsg.Namespace = ns.namespace;
            fireEvent(ns, disconnectMsg);
            this.connectedNamespaces.delete(ns.namespace);
        });
        this.waitingMessages.clear();
        if (this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }
        this.closed = true;
    }
}
exports.Conn = Conn;
//# sourceMappingURL=neffos.js.map
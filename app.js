"use strict";

var badge = null;

function on_connection_lost() {
    document.getElementById("app").innerHTML = "Connection lost <button type='button' id='ok'>OK</button>";
    badge.disconnect();
    badge = null;

    let okButton = document.getElementById("ok");
    okButton.onclick = async () => {
        start_app();
    };
}

function on_disconnect() {
    if (badge !== null) {
        badge = null;
        start_app();
    }
}

async function filesystem_list(path) {
    let result = await badge.filesystem_list(path);
    let output = "";
    for (let i = 0; i < result.length; i++) {
        let item = result[i];
        output += item.type + " " + item.name;
        if (item.stat !== null && item.type !== "dir") {
            output += " " + item.stat.size + " " + item.stat.modified;
        }
        output += "\n";
    }
    document.getElementById("output").innerText = output;
}

async function configuration_list(namespace) {
    let result = await badge.configuration_list(namespace);
    let output = "";
    for (let i = 0; i < result.length; i++) {
        let item = result[i];
        output += item.namespace + " " + item.key + " " + item.type + " " + item.size;
        output += "\n";
    }
    document.getElementById("output").innerText = output;
}

function progress_callback(message, percentage) {
    document.getElementById("output").innerText = message + "(" + percentage + "%)";
}

async function test_app() {
    document.getElementById("output").innerText = "Reading...";
    let data = null;
    try {
        data = await badge.app_read("notaplumber");
    } catch (error) {
        console.error(error);
        document.getElementById("output").innerText = "Read resulted in error";
        return;
    }
    if (data === null) {
        document.getElementById("output").innerText = "Read failed";
        return;
    }
    let result = await badge.app_write("test", "Write test", 1337, data, progress_callback);
    if (result) {
        document.getElementById("output").innerText = "Write success!";
    } else {
        document.getElementById("output").innerText = "Write failed!";
    }
}

function start_app() {
    document.getElementById("app").innerHTML = "<button type='button' id='connect'>Connect</button>";
    let connectButton = document.getElementById("connect");
    connectButton.onclick = async () => {
        badge = new Badge();
        try {
            document.getElementById("app").innerHTML = "Connecting...";
            badge.setOnConnectionLostCallback(on_connection_lost);
            badge.setOnDisconnectCallback(on_disconnect);
            await badge.connect();
            document.getElementById("app").innerHTML = "Connected to " + badge.getManufacturerName() + " " + badge.getProductName() + " with unique identifier " + badge.getSerialNumber() + "<br />" +
                "<button type='button' id='disconnect'>Disconnect</button><button type='button' id='fsls'>List files</button><button type='button' id='nvsl'>List configuration</button><button type='button' id='apptest'>Test app read/write</button><br /><pre id='output'>Ready.</pre>";
            let disconnectButton = document.getElementById("disconnect");
            disconnectButton.onclick = async () => {
                badge.disconnect();
                badge = null;
                start_app();
            }
            let fslsButton = document.getElementById("fsls");
            fslsButton.onclick = async () => {
                filesystem_list("/internal");
            }
            let nvslButton = document.getElementById("nvsl");
            nvslButton.onclick = async () => {
                configuration_list("");
            }
            let appTestButton = document.getElementById("apptest");
            appTestButton.onclick = async () => {
                test_app("");
            }
        } catch (error) {
            document.getElementById("app").innerHTML = "Failed to connect! <button type='button' id='ok'>OK</button>";
            let okButton = document.getElementById("ok");
            okButton.onclick = async () => {
                start_app();
            };
            console.error(error);
        }
    }
}

window.onload = () => {
    start_app();
};

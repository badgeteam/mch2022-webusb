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

function start_app() {
    document.getElementById("app").innerHTML = "<button type='button' id='connect'>Connect</button>";
    let connectButton = document.getElementById("connect");
    connectButton.onclick = async () => {
        badge = new Badge();
        try {
            document.getElementById("app").innerHTML = "Connecting...";
            badge.setOnConnectionLostCallback(on_connection_lost);
            await badge.connect();
            document.getElementById("app").innerHTML = "Connected to " + badge.getManufacturerName() + " " + badge.getProductName() + " with unique identifier " + badge.getSerialNumber() + "<br />" +
                "<button type='button' id='disconnect'>Disconnect</button><button type='button' id='fsls'>List files</button><button type='button' id='nvsl'>List configuration</button><br /><pre id='output'>Ready.</pre>";
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

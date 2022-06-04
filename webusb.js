"use strict";

var device = null;
var interfaces = [];
var terminal_debug = null;
var terminal_esp32 = null;
var terminal_fpga = null;

function show_connect() {
    document.getElementById("app").innerHTML = "<button type='button' id='connect'>Connect</button>";
    let connectButton = document.getElementById("connect");
    connectButton.onclick = async () => {
        device = await navigator.usb.requestDevice({
            filters: [{ vendorId: 0x16d0, productId: 0x0f9a }]
        });
        open_device().catch((error) => {
            console.error(error);
            document.getElementById("app").innerHTML = "Application crashed.";
        });
    }
}

async function open_device() {
    document.getElementById("app").innerHTML = "Connecting to device...";
    await device.open();
    await device.selectConfiguration(1);
    await show_information();
}

async function show_information() {
    let output = "<pre>";
    output += "Connected to " + device.manufacturerName + " " + device.productName + " with unique identifier " + device.serialNumber + "\n";
    
    // Claim all vendor interfaces
    interfaces = [];
    for (let index = 0; index < device.configuration.interfaces.length; index++) {
        const CLASS_VENDOR = 0xFF;
        if (device.configuration.interfaces[index].alternate.interfaceClass == CLASS_VENDOR) {
            console.log("Claim interface " + index);
            await device.claimInterface(index);
            let endpoints = device.configuration.interfaces[index].alternate.endpoints;
            let epOut = null;
            let epIn = null;
            for (let epIndex = 0; epIndex < endpoints.length; epIndex++) {
                if (endpoints[epIndex].direction == "out") {
                    epOut = endpoints[epIndex];
                }
                if (endpoints[epIndex].direction == "in") {
                    epIn = endpoints[epIndex];
                }
            }
            interfaces.push({
                index: index,
                interface: device.configuration.interfaces[index],
                epIn: epIn,
                epOut: epOut
            });
        }
    }
    
    for (let ifIndex = 0; ifIndex < interfaces.length; ifIndex++) {
        sendState(ifIndex, true);
        listen(ifIndex);
        output += "<button type='button' onclick='sendState(" + ifIndex + ", true);'>" + ifIndex + " ON</button>";
        output += "<button type='button' onclick='sendState(" + ifIndex + ", false);'>" + ifIndex + " OFF</button>";
    }

    document.getElementById("app").innerHTML = output;
}

async function sendControl(ifIndex, request, value) {
    let endpoint = interfaces[ifIndex].epOut;
    return device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: request,
        value: value,
        index: interfaces[ifIndex].index}).then(result => {
        console.log(endpoint.endpointNumber, result);
    });
}

async function sendState(ifIndex, state) {
    return sendControl(ifIndex, 0x22, state ? 0x01 : 0x00);
}

async function listen(ifIndex) {
    let endpoint = interfaces[ifIndex].epIn;
    console.log("Listening on ", endpoint.endpointNumber);
    while (true) {
        let result = await device.transferIn(endpoint.endpointNumber, endpoint.packetSize);
        const decoder = new TextDecoder();
        const message = decoder.decode(result.data);
        //console.log(endpoint.endpointNumber, ":", message);
        if (ifIndex == 0) {
            terminal_debug.write(message);
        } else if (ifIndex == 1) {
            terminal_esp32.write(message);
        } else if (ifIndex == 2) {
            terminal_fpga.write(message);
        }
    }
}

function write(ifIndex, data) {
    let endpoint = interfaces[ifIndex].epOut;
    var encoder = new TextEncoder();
    return device.transferOut(endpoint.endpointNumber, encoder.encode(data));
}

function fitTerm(terminal, id) {
    //console.log("fitTerm", terminal, id);
    let elem = document.getElementById(id);
    let style = getComputedStyle(elem);
    setTermSize(terminal, parseInt(style.width), parseInt(style.height));
}

function setTermSize(terminal, w, h) {
    try {
        terminal.resize(Math.floor(w / terminal._core._renderService.dimensions.actualCellWidth), Math.floor(h / terminal._core._renderService.dimensions.actualCellHeight));
    } catch (error) {
        // Ignore.
    }
}

function addResizeListener(terminal, id) {
    window.addEventListener('resize', fitTerm.bind(this, terminal, id));
}

var tabs = [];

function selectTab(select) {
    let buttons = "";
    for (let index = 0; index < tabs.length; index++) {
        let elem = document.getElementById(tabs[index].id);
        elem.style.display = (index == select) ? "block" : "none";
        buttons += "<button type='button' onclick='selectTab(" + index + ");' style='background-color: " + ((index == select) ? "#FFFF00" : "#FFFFFF") + ";'>" + tabs[index].label + "</button>"
    }
    document.getElementById("tabs").innerHTML = buttons;
    
    if (typeof tabs[select].onSelect === "function") {
        tabs[select].onSelect();
    }
}

function initTabs(newTabs) {
    tabs = newTabs;
    selectTab(0);
}

window.onload = () => {
    terminal_debug = new Terminal();
    terminal_debug.open(document.getElementById('terminal_debug'));
    addResizeListener(terminal_debug, "terminal_debug");
    terminal_debug.onData(data => {
      write(0, data);
    });
    terminal_esp32 = new Terminal();
    terminal_esp32.open(document.getElementById('terminal_esp32'));
    addResizeListener(terminal_esp32, "terminal_esp32");
    terminal_esp32.onData(data => {
      write(1, data);
    });
    terminal_fpga = new Terminal();
    terminal_fpga.open(document.getElementById('terminal_fpga'));
    addResizeListener(terminal_fpga, "terminal_fpga");
    terminal_fpga.onData(data => {
      write(2, data);
    });
    
    initTabs([
        {id: "terminal_debug", label: "Control (RP2040)", onSelect: fitTerm.bind(this, terminal_debug, "terminal_debug")},
        {id: "terminal_esp32", label: "CPU (ESP32)", onSelect: fitTerm.bind(this, terminal_esp32, "terminal_esp32")},
        {id: "terminal_fpga", label: "FPGA (ICE40)", onSelect: fitTerm.bind(this, terminal_fpga, "terminal_fpga")}
    ]);
    
    fitTerm(terminal_debug, "terminal_debug");
    fitTerm(terminal_esp32, "terminal_esp32");
    fitTerm(terminal_fpga, "terminal_fpga");
    
    show_connect();
};

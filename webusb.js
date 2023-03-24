"use strict";

class Badge {
    constructor() {
        this.text_encoder = new TextEncoder();
        this.text_decoder = new TextDecoder();

        this.filters = [
            { vendorId: 0x16d0, productId: 0x0f9a } // MCH2022 badge
        ];

        // USB control transfer requests
        this.REQUEST_STATE          = 0x22;
        this.REQUEST_RESET          = 0x23;
        this.REQUEST_BAUDRATE       = 0x24;
        this.REQUEST_MODE           = 0x25;
        this.REQUEST_MODE_GET       = 0x26;
        this.REQUEST_FW_VERSION_GET = 0x27;

        // ESP32 firmware boot modes
        this.MODE_NORMAL        = 0x00;
        this.MODE_WEBUSB_LEGACY = 0x01;
        this.MODE_FPGA_DOWNLOAD = 0x02;
        this.MODE_WEBUSB        = 0x03;

        // Protocol
        this.PROTOCOL_MAGIC                               = 0xFEEDF00D;
        this.PROTOCOL_COMMAND_SYNC                        = new DataView(this.text_encoder.encode("SYNC").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_PING                        = new DataView(this.text_encoder.encode("PING").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_LIST             = new DataView(this.text_encoder.encode("FSLS").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_EXISTS           = new DataView(this.text_encoder.encode("FSEX").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_CREATE_DIRECTORY = new DataView(this.text_encoder.encode("FSMD").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_REMOVE           = new DataView(this.text_encoder.encode("FSRM").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_STATUS           = new DataView(this.text_encoder.encode("FSST").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_FILE_WRITE       = new DataView(this.text_encoder.encode("FSFW").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_FILE_READ        = new DataView(this.text_encoder.encode("FSFR").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_FILESYSTEM_FILE_CLOSE       = new DataView(this.text_encoder.encode("FSFC").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_TRANSFER_CHUNK              = new DataView(this.text_encoder.encode("CHNK").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_APP_LIST                    = new DataView(this.text_encoder.encode("APPL").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_APP_READ                    = new DataView(this.text_encoder.encode("APPR").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_APP_WRITE                   = new DataView(this.text_encoder.encode("APPW").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_APP_REMOVE                  = new DataView(this.text_encoder.encode("APPD").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_APP_RUN                     = new DataView(this.text_encoder.encode("APPX").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_CONFIGURATION_LIST          = new DataView(this.text_encoder.encode("NVSL").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_CONFIGURATION_READ          = new DataView(this.text_encoder.encode("NVSR").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_CONFIGURATION_WRITE         = new DataView(this.text_encoder.encode("NVSW").buffer).getUint32(0, true);
        this.PROTOCOL_COMMAND_CONFIGURATION_REMOVE        = new DataView(this.text_encoder.encode("NVSD").buffer).getUint32(0, true);

        this.interfaceIndex = 4; // Defined in the USB descriptor for MCH2022 badge, set to NULL to automatically find the first vendor interface

        this.device = null;
        this.endpoint_in = null;
        this.endpoint_out = null;

        this.data_buffer = new ArrayBuffer(0);

        this.next_identifier = 0;
        this.transaction_promises = {};
        this.in_sync = false;

        this.on_connection_lost = null;
    }

    _checkDeviceConnected() {
        if (this.device === null) {
            throw new Error("Not connected");
        }
    }

    async _findInterfaceIndex(firstInterfaceIndex = 0) {
        const USB_CLASS_VENDOR = 0xFF;
        for (let index = firstInterfaceIndex; index < this.device.configuration.interfaces.length; index++) {
            if (this.device.configuration.interfaces[index].alternate.interfaceClass == USB_CLASS_VENDOR) {
                return index;
            }
        }
        return null;
    }

    async _findEndpoints() {
        let endpoints = this.device.configuration.interfaces[this.interfaceIndex].alternate.endpoints;
        for (let index = 0; index < endpoints.length; index++) {
            if (endpoints[index].direction == "out") {
                this.endpoint_out = endpoints[index];
            }
            if (endpoints[index].direction == "in") {
                this.endpoint_in = endpoints[index];
            }
        }
    }

    async _controlTransferOut(request, value) {
        await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: request,
            value: value,
            index: this.interfaceIndex
        });
    }

    async _controlTransferIn(request, length = 1) {
        let result = await this.device.controlTransferIn({
            requestType: 'class',
            recipient: 'interface',
            request: request,
            value: 0,
            index: this.interfaceIndex
        }, length);
        return result.data;
    }

    async _dataTransferOut(data) {
        await this.device.transferOut(this.endpoint_out.endpointNumber, data);
    }

    async _dataTransferIn(amount) {
        let result = await this.device.transferIn(this.endpoint_in.endpointNumber, 8192 + 20);
        return result.data;
    }

    _concatBuffers(buffers = []) {
        let total_length = 0;
        for (let i = 0; i < buffers.length; i++) {
            total_length += buffers[i].byteLength;
        }
        var tmp = new Uint8Array(total_length);
        let offset = 0;
        for (let i = 0; i < buffers.length; i++) {
            if (buffers[i].byteLength === 0) continue;
            tmp.set(new Uint8Array(buffers[i]), offset);
            offset += buffers[i].byteLength;
        }
        return tmp.buffer;
    }

    async _sendPacket(identifier, command, payload = new ArrayBuffer()) {
        let header = new ArrayBuffer(20);
        let dataView = new DataView(header);
        dataView.setUint32(0, this.PROTOCOL_MAGIC, true);
        dataView.setUint32(4, identifier, true);
        dataView.setUint32(8, command, true);
        dataView.setUint32(12, payload.length, true);
        dataView.setUint32(16, payload.length > 0 ? crc32FromArrayBuffer(payload) : 0, true);
        let packet = this._concatBuffers([header, payload]);
        await this._dataTransferOut(packet);
    }

    _createTransactionPromise() {
        let promiseResolve, promiseReject;
        let promise = new Promise((resolve, reject) => {
            promiseResolve = resolve;
            promiseReject = reject;
        });
        return {
            promise: promise,
            resolve: promiseResolve,
            reject: promiseReject,
            result: null,
            error: null,
            response: null,
            response_text: null,
            timeout: null
        };
    }

    async _transaction(command, payload = new ArrayBuffer(), timeout = 0) {
        let transaction = this._createTransactionPromise();
        let identifier = this.next_identifier;
        this.transaction_promises[identifier] = transaction;
        this.next_identifier = (this.next_identifier + 1) & 0xFFFFFFFF;
        if (timeout > 0) {
            transaction.timeout = setTimeout(() => {
                transaction.error = new Error("timeout");
                transaction.reject();
                delete this.transaction_promises[identifier];
                this.in_sync = false;
            }, timeout);
        }
        await this._sendPacket(identifier, command, payload);
        try {
            await transaction.promise;
            if (transaction.response !== command) {
                console.error("Badge reports error " + transaction.response_text);
                throw new Error("Error response " + transaction.response_text);
            } else {
                return transaction.result;
            }
        } catch (error) {
            throw transaction.error;
        }
    }

    async _handleData(new_buffer) {
        this.data_buffer = this._concatBuffers([this.data_buffer, new_buffer]);

        while (this.data_buffer.byteLength >= 20) {
            let dataView = new DataView(this.data_buffer);
            let magic = dataView.getUint32(0, true);
            if (magic == this.PROTOCOL_MAGIC) {
                let dataView = new DataView(this.data_buffer);
                let magic = dataView.getUint32(0, true);
                if (magic == this.PROTOCOL_MAGIC) {
                    let payload_length = dataView.getUint32(12, true);
                    if (this.data_buffer.byteLength >= 20 + payload_length) {
                        await this._handlePacket(this.data_buffer.slice(0, 20 + payload_length));
                        this.data_buffer = this.data_buffer.slice(20 + payload_length);
                    } else {
                        return; // Wait for more data
                    }
                }
            } else {
                this.data_buffer = this.data_buffer.slice(1); // Shift buffer
            }
        }
    }

    async _handlePacket(buffer) {
        let dataView = new DataView(buffer);
        let magic = dataView.getUint32(0, true);
        let identifier = dataView.getUint32(4, true);
        let response = dataView.getUint32(8, true);
        let payload_length = dataView.getUint32(12, true);
        let payload_crc = dataView.getUint32(16, true);
        let payload = null;
        if (payload_length > 0) {
            payload = buffer.slice(20);
            if (crc32FromArrayBuffer(payload) !== payload_crc) {
                if (identifier in this.transaction_promises) {
                    if (this.transaction_promises[identifier].timeout !== null) {
                        clearTimeout(this.transaction_promises[identifier].timeout);
                    }
                    this.transaction_promises[identifier].response = response;
                    this.transaction_promises[identifier].response_text = this.text_decoder.decode(new Uint8Array(buffer.slice(8,12)));
                    this.transaction_promises[identifier].error = new Error("crc");
                    this.transaction_promises[identifier].reject();
                    delete this.transaction_promises[identifier];
                } else {
                    console.error("Found no transaction for", identifier, response);
                }
                return;
            }
        }
        if (identifier in this.transaction_promises) {
            if (this.transaction_promises[identifier].timeout !== null) {
                clearTimeout(this.transaction_promises[identifier].timeout);
            }
            this.transaction_promises[identifier].response = response;
            this.transaction_promises[identifier].response_text = this.text_decoder.decode(new Uint8Array(buffer.slice(8,12)));
            this.transaction_promises[identifier].result = payload;
            this.transaction_promises[identifier].resolve();
            delete this.transaction_promises[identifier];
        } else {
            console.error("Found no transaction for", identifier, response);
        }
    }

    async _listen() {
        if (this.listening) return;
        this.listening = true;
        try {
            while (this.listening) {
                let result = await this._dataTransferIn();
                if (!this.listening) break;
                await this._handleData(result.buffer);
            }
        } catch (error) {
            this.listening = false;
            if (this.on_connection_lost !== null) {
                this.on_connection_lost();
            }
        }
    }

    async _stopListening() {
        if (!this.listening) return;
        this.listening = false;
        await this._sendPacket(0, this.PROTOCOL_COMMAND_SYNC);
    }

    setOnConnectionLostCallback(callback) {
        this.on_connection_lost = callback;
    }

    async connect() {
        if (this.device !== null) {
            throw new Error("Already connected");
        }
        this.device = await navigator.usb.requestDevice({
            filters: this.filters
        });
        await this.device.open();
        await this.device.selectConfiguration(1);
        if (this.interfaceIndex === null) { // Optional automatic discovery of the interface index
            this.interfaceIndex = await this._findInterfaceIndex();
        }
        await this.device.claimInterface(this.interfaceIndex);
        await this._findEndpoints();

        await this.controlSetState(true);
        await this.controlSetBaudrate(921600);

        let currentMode = await this.controlGetMode();
        if (currentMode != this.MODE_WEBUSB) {
            await this.controlSetMode(this.MODE_WEBUSB);
            await this.controlReset(false);
        }

        this._listen();

        let protocol_version = false;
        while (!protocol_version) {
            protocol_version = await this.sync();
        }

        if (protocol_version < 1) {
            throw new Error("Protocol version not supported");
        }
    }

    async disconnect() {
        this._checkDeviceConnected();
        try {
            this._stopListening();
            await this.controlSetMode(this.MODE_NORMAL);
            await this.controlReset(false);
            await this.controlSetState(false);
            await this.device.releaseInterface(this.interfaceIndex);
        } catch (error) {
            // Ignore errors
        }
        await this.device.close();
        this.next_identifier = 0;
        this.transaction_callbacks = {};
    }

    getManufacturerName() {
        this._checkDeviceConnected();
        return this.device.manufacturerName;
    }

    getProductName() {
        this._checkDeviceConnected();
        return this.device.productName;
    }

    getSerialNumber() {
        this._checkDeviceConnected();
        return this.device.serialNumber;
    }

    async controlSetState(state) {
        await this._controlTransferOut(this.REQUEST_STATE, state ? 0x0001 : 0x0000);
    }

    async controlReset(bootloader_mode = false) {
        await this._controlTransferOut(this.REQUEST_RESET, bootloader_mode ? 0x01 : 0x00);
    }

    async controlSetBaudrate(baudrate) {
        await this._controlTransferOut(this.REQUEST_BAUDRATE, Math.floor(baudrate / 100));
    }

    async controlSetMode(mode) {
        await this._controlTransferOut(this.REQUEST_MODE, mode);
    }

    async controlGetMode() {
        let result = await this._controlTransferIn(this.REQUEST_MODE_GET, 1);
        return result.getUint8(0);
    }

    async controlGetFirmwareVersion() {
        let result = await this._controlTransferIn(this.REQUEST_FW_VERSION_GET, 1);
        return result.getUint8(0);
    }

    async sync() {
        try {
            let result = await this._transaction(this.PROTOCOL_COMMAND_SYNC, new ArrayBuffer(), 100);
            this.in_sync = true;
            return new DataView(result).getUint16(0, true);
        } catch (error) {
            return false;
        }
    }

    async sync_if_needed() {
        while (!this.in_sync) {
            await this.sync();
        }
    }

    async filesystem_list(path) {
        await this.sync_if_needed();
        let path_encoded = this.text_encoder.encode(path);
        let data = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_LIST, path_encoded, 1000);
        let result = [];
        while (data.byteLength > 0) {
            let dataView = new DataView(data);
            let item_type = dataView.getUint8(0, true);
            let item_name_length = dataView.getUint32(1, true);
            let item_name = this.text_decoder.decode(data.slice(5, 5 + item_name_length));
            data = data.slice(5 + item_name_length);
            dataView = new DataView(data);
            let stat_res = dataView.getInt32(0, true);
            let item_size = dataView.getUint32(4, true);
            let item_modified = dataView.getBigUint64(8, true);
            data = data.slice(16);
            result.push({
                type: item_type === 2 ? "dir" : "file",
                name: item_name,
                stat: stat_res === 0 ? {
                    size: item_size,
                    modified: item_modified
                } : null
            });
        }
        return result;
    }

    async configuration_list(namespace = "") {
        await this.sync_if_needed();
        let namespace_encoded = this.text_encoder.encode(namespace);
        let data = await this._transaction(this.PROTOCOL_COMMAND_CONFIGURATION_LIST, namespace_encoded, 1000);
        let result = [];
        while (data.byteLength > 0) {
            let dataView = new DataView(data);
            let namespace_length = dataView.getUint16(0, true);
            let namespace = this.text_decoder.decode(data.slice(2, 2 + namespace_length));
            data = data.slice(2 + namespace_length);
            dataView = new DataView(data);
            let key_length = dataView.getUint16(0, true);
            let key = this.text_decoder.decode(data.slice(2, 2 + key_length));
            data = data.slice(2 + key_length);
            dataView = new DataView(data);
            let type = dataView.getUint8(0);
            let size = dataView.getUint32(0, true);
            data = data.slice(5);
            result.push({
                namespace: namespace,
                key: key,
                type: type,
                size: size
            });
        }
        return result;
    }
}

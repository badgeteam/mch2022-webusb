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
        this.PROTOCOL_COMMAND_FILESYSTEM_STATE           = new DataView(this.text_encoder.encode("FSST").buffer).getUint32(0, true);
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
        this.on_disconnect = null;
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
        let result = await this.device.transferIn(this.endpoint_in.endpointNumber, 64);//20 + 8192);
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

    async _sendPacket(identifier, command, payload = null) {
        if (payload === null) payload = new ArrayBuffer(0);
        let header = new ArrayBuffer(20);
        let dataView = new DataView(header);
        dataView.setUint32(0, this.PROTOCOL_MAGIC, true);
        dataView.setUint32(4, identifier, true);
        dataView.setUint32(8, command, true);
        dataView.setUint32(12, payload.byteLength, true);
        dataView.setUint32(16, payload.byteLength > 0 ? crc32FromArrayBuffer(payload) : 0, true);
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
                let payload_length = dataView.getUint32(12, true);
                if (this.data_buffer.byteLength >= 20 + payload_length) {
                    await this._handlePacket(this.data_buffer.slice(0, 20 + payload_length));
                    this.data_buffer = this.data_buffer.slice(20 + payload_length);
                } else {
                    return; // Wait for more data
                }
            } else {
                console.log("garbage", new DataView(this.data_buffer).getUint8(0));
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
            console.error(error);
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

    setOnDisconnectCallback(callback) {
        this.on_disconnect = callback;
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

        if (protocol_version < 2) {
            throw new Error("Protocol version not supported");
        }
    }

    async disconnect(reset = true) {
        this._checkDeviceConnected();
        try {
            this._stopListening();
            await this.controlSetMode(this.MODE_NORMAL);
            if (reset) await this.controlReset(false);
            await this.controlSetState(false);
            await this.device.releaseInterface(this.interfaceIndex);
        } catch (error) {
            // Ignore errors
        }
        await this.device.close();
        this.next_identifier = 0;
        this.transaction_callbacks = {};

        if (this.on_disconnect !== null) {
            this.on_disconnect();
        }
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
            this.data_buffer = new ArrayBuffer(0);
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
        let data = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_LIST, path_encoded, 4000);
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

    async filesystem_file_exists(path) {
        if (typeof path !== "string") throw new Error("Path should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_EXISTS, this.text_encoder.encode(path), 4000);
        return (new DataView(result).getUint8(0) == 1);
    }

    async filesystem_create_directory(path) {
        if (typeof path !== "string") throw new Error("Path should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_CREATE_DIRECTORY, this.text_encoder.encode(path), 4000);
        return (new DataView(result).getUint8(0) == 1);
    }

    async filesystem_remove(path) {
        if (typeof path !== "string") throw new Error("Path should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_REMOVE, this.text_encoder.encode(path), 4000);
        return (new DataView(result).getUint8(0) == 1);
    }

    async filesystem_state() {
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_STATE, null, 4000);
        let dataView = new DataView(result);
        return {
            internal: {
                size: dataView.getBigUint64(0, true),
                free: dataView.getBigUint64(8, true)
            },
            sd: {
                size: dataView.getBigUint64(16, true),
                free: dataView.getBigUint64(24, true)
            },
            app: {
                size: dataView.getBigUint64(32, true),
                free: dataView.getBigUint64(40, true)
            }
        };
    }

    async filesystem_file_read(path) {
        if (typeof path !== "string") throw new Error("Path should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_FILE_READ, this.text_encoder.encode(path), 4000);
        if (new DataView(result).getUint8(0) !== 1) return null; // Failed to open file
        let parts = [];
        let requested_size = new ArrayBuffer(4);
        new DataView(requested_size).setUint32(0, 512, true);
        while (true) {
            let part = await this._transaction(this.PROTOCOL_COMMAND_TRANSFER_CHUNK, requested_size, 4000);
            if (part === null || part.byteLength < 1) break;
            parts.push(part);
        }
        await this.filesystem_file_close();
        return this._concatBuffers(parts);
    }

    async filesystem_file_write(path, data, progress_callback = null) {
        if (typeof path !== "string") throw new Error("Path should be a string");
        if (!(data instanceof ArrayBuffer)) throw new Error("Data should be an ArrayBuffer");
        await this.sync_if_needed();
        if (progress_callback !== null) {
            progress_callback("Creating...", 0);
        }
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_FILE_WRITE, this.text_encoder.encode(path), 4000);
        if (new DataView(result).getUint8(0) !== 1) throw new Error("Failed to open file");
        let total = data.byteLength;
        let position = 0;
        while (data.byteLength > 0) {
            if (progress_callback !== null) {
                progress_callback("Writing...", Math.round((position * 100) / total));
            }
            let part = data.slice(0, 512);
            if (part.byteLength < 1) break;
            let result = await this._transaction(this.PROTOCOL_COMMAND_TRANSFER_CHUNK, part, 4000);
            let written = new DataView(result).getUint32(0, true);
            if (written < 1) throw new Error("Write failed");
            position += written;
            data = data.slice(written);
        }
        if (progress_callback !== null) {
            progress_callback("Closing...", 100);
        }
        await this.filesystem_file_close();
        return (position == total);
    }

    async filesystem_file_close() {
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_FILESYSTEM_FILE_CLOSE, null, 4000);
        return (new DataView(result).getUint8(0) == 1);
    }

    async app_list() {
        await this.sync_if_needed();
        let data = await this._transaction(this.PROTOCOL_COMMAND_APP_LIST, null, 4000);
        let result = [];
        while (data.byteLength > 0) {
            let dataView = new DataView(data);
            let name_length = dataView.getUint16(0, true);
            let name = this.text_decoder.decode(data.slice(2, 2 + name_length));
            let title_length = dataView.getUint16(2 + name_length, true);
            let title = this.text_decoder.decode(data.slice(2 + name_length + 2, 2 + name_length + 2 + title_length));
            let version = dataView.getUint16(2 + name_length + 2 + title_length, true);
            let size = dataView.getUint32(2 + name_length + 2 + title_length + 2, true);
            data = data.slice(2 + name_length + 2 + title_length + 2 + 4);
            result.push({
                name: name,
                title: title,
                version: version,
                size: size
            });
        }
        return result;
    }

    async app_read(name) {
        if (typeof name !== "string") throw new Error("Name should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_APP_READ, this.text_encoder.encode(name), 4000);
        if (new DataView(result).getUint8(0) !== 1) return null; // Failed to open file
        let parts = [];
        let requested_size = new ArrayBuffer(4);
        new DataView(requested_size).setUint32(0, 64, true);
        while (true) {
            let part = await this._transaction(this.PROTOCOL_COMMAND_TRANSFER_CHUNK, requested_size, 4000);
            if (part === null || part.byteLength < 1) break;
            console.log("Read", part.byteLength);
            parts.push(part);
        }
        await this.filesystem_file_close(); // This also works on appfs "files"
        return this._concatBuffers(parts);
    }

    async app_write(name, title, version, data, progress_callback = null) {
        if (typeof name !== "string") throw new Error("Name should be a string");
        if (typeof title !== "string") throw new Error("Title should be a string");
        if (typeof version !== "number") throw new Error("Version should be a number");
        if (!(data instanceof ArrayBuffer)) throw new Error("Data should be an ArrayBuffer");
        await this.sync_if_needed();
        let request = new Uint8Array(10 + name.length + title.length);
        let dataView = new DataView(request.buffer);
        request.set([name.length], 0);
        request.set(this.text_encoder.encode(name), 1);
        request.set([title.length], 1 + name.length);
        request.set(this.text_encoder.encode(title), 2 + name.length);
        dataView.setUint32(2 + name.length + title.length, data.byteLength, true);
        dataView.setUint16(2 + name.length + title.length + 4, version, true);
        if (progress_callback !== null) {
            progress_callback("Allocating...", 0);
        }
        let result = await this._transaction(this.PROTOCOL_COMMAND_APP_WRITE, request.buffer, 10000);
        if (new DataView(result).getUint8(0) !== 1) throw new Error("Failed to allocate app");
        let total = data.byteLength;
        let position = 0;
        while (data.byteLength > 0) {
            if (progress_callback !== null) {
                progress_callback("Writing...", Math.round((position * 100) / total));
            }
            let part = data.slice(0, 1024);
            if (part.byteLength < 1) break;
            let result = await this._transaction(this.PROTOCOL_COMMAND_TRANSFER_CHUNK, part, 4000);
            let written = new DataView(result).getUint32(0, true);
            if (written < 1) throw new Error("Write failed");
            position += written;
            data = data.slice(written);
        }
        if (progress_callback !== null) {
            progress_callback("Closing...", 100);
        }
        await this.filesystem_file_close();
        return (position == total);
    }

    async app_remove(name) {
        if (typeof name !== "string") throw new Error("Name should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_APP_REMOVE, this.text_encoder.encode(name), 4000);
        return (new DataView(result).getUint8(0) == 1);
    }

    async app_run(name) {
        if (typeof name !== "string") throw new Error("Name should be a string");
        await this.sync_if_needed();
        let result = await this._transaction(this.PROTOCOL_COMMAND_APP_RUN, this.text_encoder.encode(name), 4000);
        let status = (new DataView(result).getUint8(0) == 1);
        if (status) {
            this.disconnect(false);
        }
        return status;
    }

    _configuration_data_decode(type_number, data) {
        let dataView = new DataView(data);
        if (type_number == 0x01) return dataView.getUint8(0);
        if (type_number == 0x11) return dataView.getInt8(0);
        if (type_number == 0x02) return dataView.getUint16(0, true);
        if (type_number == 0x12) return dataView.getint16(0, true);
        if (type_number == 0x04) return dataView.getUint32(0, true);
        if (type_number == 0x14) return dataView.getint32(0, true);
        if (type_number == 0x08) return dataView.getBigUint64(0, true);
        if (type_number == 0x18) return dataView.getBigInt64(0, true);
        if (type_number == 0x21) return this.text_decoder.decode(data);
        if (type_number == 0x42) return data;
        throw new Error("Invalid configuration type");
    }

    _configuration_data_encode(type_number, data) {
        if (type_number == 0x01) {
            let buffer = new ArrayBuffer(1);
            let dataView = new DataView(buffer);
            dataView.setUint8(0, data);
            return buffer;
        }
        if (type_number == 0x11) {
            let buffer = new ArrayBuffer(1);
            let dataView = new DataView(buffer);
            dataView.setInt8(0, data);
            return buffer;
        }
        if (type_number == 0x02) {
            let buffer = new ArrayBuffer(2);
            let dataView = new DataView(buffer);
            dataView.setUint16(0, data, true);
            return buffer;
        }
        if (type_number == 0x12) {
            let buffer = new ArrayBuffer(2);
            let dataView = new DataView(buffer);
            dataView.setInt16(0, data, true);
            return buffer;
        }
        if (type_number == 0x04) {
            let buffer = new ArrayBuffer(4);
            let dataView = new DataView(buffer);
            dataView.setUint32(0, data, true);
            return buffer;
        }
        if (type_number == 0x14) {
            let buffer = new ArrayBuffer(4);
            let dataView = new DataView(buffer);
            dataView.setInt32(0, data, true);
            return buffer;
        }
        if (type_number == 0x08) {
            let buffer = new ArrayBuffer(8);
            let dataView = new DataView(buffer);
            dataView.setBigUint64(0, data, true);
            return buffer;
        }
        if (type_number == 0x18) {
            let buffer = new ArrayBuffer(8);
            let dataView = new DataView(buffer);
            dataView.setBigInt64(0, data, true);
            return buffer;
        }
        if (type_number == 0x21) return this.text_encoder.encode(data);
        if (type_number == 0x42) return data;
        throw new Error("Invalid configuration type");
    }

    configuration_type_to_number(type) {
        switch(type) {
            case "u8": return 0x01;
            case "i8": return 0x11;
            case "u16": return 0x02;
            case "i16": return 0x12;
            case "u32": return 0x04;
            case "i32": return 0x14;
            case "u64": return 0x08;
            case "i64": return 0x18;
            case "string": return 0x21;
            case "blob": return 0x42;
            default: throw new Error("Invalid configuration type");
        }
    }

    configuration_number_to_type(type) {
        switch(type) {
            case 0x01: return "u8";
            case 0x11: return "i8";
            case 0x02: return "u16";
            case 0x12: return "i16";
            case 0x04: return "u32";
            case 0x14: return "i32";
            case 0x08: return "64";
            case 0x18: return "i64";
            case 0x21: return "string";
            case 0x42: return "blob";
            default: throw new Error("Invalid configuration type");
        }
    }

    async configuration_list(namespace = "") {
        if (typeof namespace !== "string") throw new Error("Namespace should be a string");
        await this.sync_if_needed();
        let namespace_encoded = this.text_encoder.encode(namespace);
        let data = await this._transaction(this.PROTOCOL_COMMAND_CONFIGURATION_LIST, namespace_encoded, 4000);
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

    async configuration_read(namespace, key, type) {
        if (typeof namespace !== "string") throw new Error("Namespace should be a string");
        if (typeof key !== "string") throw new Error("Key should be a string");
        if (typeof type === "string") type = this.configuration_type_to_number(type);
        if (typeof type !== "number") throw new Error("Type should be a number");
        if (namespace.length > 16 || namespace.length < 1) throw new Error("Namespace must be a minimum of 1 character and at most 16 characters long");
        if (key.length > 16 || key.length < 1) throw new Error("Key must be a minimum of 1 character and at most 16 characters long");
        await this.sync_if_needed();
        let request = new Uint8Array(3 + namespace.length + key.length);
        request.set([namespace.length], 0);
        request.set(this.text_encoder.encode(namespace), 1);
        request.set([key.length], 1 + namespace.length);
        request.set(this.text_encoder.encode(key), 2 + namespace.length);
        request.set([type], 2 + namespace.length + key.length);
        let result = await this._transaction(this.PROTOCOL_COMMAND_CONFIGURATION_READ, request.buffer, 4000);
        if (result === null) return null;
        return this._configuration_data_decode(type, result);
    }

    async configuration_write(namespace, key, type, value) {
        if (typeof namespace !== "string") throw new Error("Namespace should be a string");
        if (typeof key !== "string") throw new Error("Key should be a string");
        if (typeof type === "string") type = this.configuration_type_to_number(type);
        if (typeof type !== "number") throw new Error("Type should be a number");
        if (namespace.length > 16 || namespace.length < 1) throw new Error("Namespace must be a minimum of 1 character and at most 16 characters long");
        if (key.length > 16 || key.length < 1) throw new Error("Key must be a minimum of 1 character and at most 16 characters long");
        await this.sync_if_needed();
        let header = new Uint8Array(3 + namespace.length + key.length);
        header.set([namespace.length], 0);
        header.set(this.text_encoder.encode(namespace), 1);
        header.set([key.length], 1 + namespace.length);
        header.set(this.text_encoder.encode(key), 2 + namespace.length);
        header.set([type], 2 + namespace.length + key.length);
        let request = this._concatBuffers([header.buffer, this._configuration_data_encode(type, value)]);
        let result = await this._transaction(this.PROTOCOL_COMMAND_CONFIGURATION_WRITE, request, 4000);
        return (new DataView(result).getUint8(0) == 1);
    }

    async configuration_remove(namespace, key) {
        if (typeof namespace !== "string") throw new Error("Namespace should be a string");
        if (typeof key !== "string") throw new Error("Key should be a string");
        if (namespace.length > 16 || namespace.length < 1) throw new Error("Namespace must be a minimum of 1 character and at most 16 characters long");
        if (key.length > 16 || key.length < 1) throw new Error("Key must be a minimum of 1 character and at most 16 characters long");
        await this.sync_if_needed();
        let request = new Uint8Array(2 + namespace.length + key.length);
        request.set([namespace.length], 0);
        request.set(this.text_encoder.encode(namespace), 1);
        request.set([key.length], 1 + namespace.length);
        request.set(this.text_encoder.encode(key), 2 + namespace.length);
        let result = await this._transaction(this.PROTOCOL_COMMAND_CONFIGURATION_REMOVE, request.buffer, 4000);
        return (new DataView(result).getUint8(0) == 1);
    }
}

// script.js
import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.5.4/bundle.js";

const BAUD_RATE = 921600;
const FLASH_OFFSET = 0x0;

const log = document.getElementById("log");
const butConnect = document.getElementById("butConnect");
const butProgram = document.getElementById("butProgram");
const firmwareSelect = document.getElementById("firmwareSelect");

let device = null;
let transport = null;
let esploader = null;
let progressLine = null;

// Example firmware files (replace with your actual firmware files)
const availableFirmware = [
    "firmware/ideaboardfirmware03202025.bin"
];

document.addEventListener("DOMContentLoaded", () => {
    butConnect.addEventListener("click", clickConnect);
    butProgram.addEventListener("click", clickProgram);

    if ("serial" in navigator) {
        document.getElementById("notSupported").style.display = "none";
    }

    // Populate firmware dropdown
    availableFirmware.forEach(firmware => {
        const option = document.createElement("option");
        option.value = firmware;
        option.textContent = firmware.split('/').pop(); // Show only filename
        firmwareSelect.appendChild(option);
    });

    logLine("Ideaboard Flasher loaded.");
});

function logLine(text) {
    if (text.startsWith("Programming: ")) return;
    if (text.startsWith("Writing at")) {
        if (!progressLine) {
            progressLine = document.createElement("div");
            log.appendChild(progressLine);
        }
        progressLine.textContent = text;
        log.scrollTop = log.scrollHeight;
        return;
    }
    const line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function logError(text) {
    const line = document.createElement("div");
    line.innerHTML = `<span style="color: red;">Error: ${text}</span>`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

async function clickConnect() {
    if (transport) {
        await transport.disconnect();
        await sleep(1500);
        toggleUI(false);
        transport = null;
        if (device) {
            await device.close();
            device = null;
        }
        return;
    }

    try {
        device = await navigator.serial.requestPort({});
        transport = new Transport(device, true);
        const loaderOptions = {
            transport: transport,
            baudrate: BAUD_RATE,
            terminal: {
                clean: () => (log.innerHTML = ""),
                writeLine: (data) => logLine(data),
                write: (data) => {
                    const line = document.createElement("div");
                    line.textContent = data;
                    log.appendChild(line);
                    log.scrollTop = log.scrollHeight;
                },
            },
        };
        esploader = new ESPLoader(loaderOptions);
        await esploader.main("default_reset");
        toggleUI(true);
        logLine(`Connected at ${BAUD_RATE} baud.`);
    } catch (e) {
        logError(e.message);
        toggleUI(false);
    }
}

async function clickProgram() {
    const selectedFirmware = firmwareSelect.value;
    if (!selectedFirmware) {
        logError("Please select a firmware file first");
        return;
    }

    if (!confirm("This will erase and program the flash. Continue?")) return;

    butProgram.disabled = true;
    progressLine = null;
    try {
        logLine("Erasing flash...");
        const eraseStart = Date.now();
        await esploader.eraseFlash();
        logLine(`Erase completed in ${Date.now() - eraseStart}ms.`);

        logLine("Fetching firmware...");
        const response = await fetch(selectedFirmware);
        if (!response.ok) throw new Error("Failed to fetch firmware");
        const arrayBuffer = await response.arrayBuffer();
        const firmwareData = arrayBufferToBinaryString(arrayBuffer);

        const flashOptions = {
            fileArray: [{ data: firmwareData, address: FLASH_OFFSET }],
            flashSize: "keep",
            eraseAll: false,
            compress: true,
            reportProgress: () => {},
            calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
        };

        logLine(`Programming firmware at offset 0x${FLASH_OFFSET.toString(16)}...`);
        const programStart = Date.now();
        await esploader.writeFlash(flashOptions);
        logLine(`Programming completed in ${Date.now() - programStart}ms.`);
        logLine("Firmware installed successfully. Reset your device to run it.");
    } catch (e) {
        logError(e.message);
    } finally {
        butProgram.disabled = !transport;
    }
}

function toggleUI(connected) {
    butConnect.textContent = connected ? "Disconnect" : "Connect";
    butProgram.disabled = !connected;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function arrayBufferToBinaryString(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binaryString = "";
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    return binaryString;
}
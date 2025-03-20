// script.js
// ... (keep existing imports and constants)

let device = null;
let transport = null;
let esploader = null;
let progressLine = null;
let reader = null;  // Add this to handle continuous reading

// ... (keep existing DOM element selections and availableFirmware)

// Add this new function to read serial output continuously
async function startSerialReader() {
    if (!transport || !device) return;
    
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                logLine("Serial reader closed");
                break;
            }
            if (value) {
                const text = new TextDecoder().decode(value);
                logLine(text);
            }
        }
    } catch (e) {
        logError(`Serial read error: ${e.message}`);
    }
}

// Modify the DOMContentLoaded handler
document.addEventListener("DOMContentLoaded", () => {
    butConnect.addEventListener("click", clickConnect);
    butProgram.addEventListener("click", clickProgram);

    if ("serial" in navigator) {
        document.getElementById("notSupported").style.display = "none";
    }

    availableFirmware.forEach(firmware => {
        const option = document.createElement("option");
        option.value = firmware;
        option.textContent = firmware.split('/').pop();
        firmwareSelect.appendChild(option);
    });

    logLine("Ideaboard Flasher loaded.");
});

// Modify clickConnect to initialize the reader
async function clickConnect() {
    if (transport) {
        if (reader) {
            await reader.cancel();
            reader = null;
        }
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
        
        // Start reading from serial port
        reader = device.readable.getReader();
        startSerialReader();  // Start the continuous reading
        
        toggleUI(true);
        logLine(`Connected at ${BAUD_RATE} baud.`);
    } catch (e) {
        logError(e.message);
        toggleUI(false);
    }
}

// Modify clickProgram to keep connection alive
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
        logLine("Firmware installed successfully. Device will now reset and show output...");
        
        // Instead of closing, perform a soft reset and keep reading
        await esploader.softReset();
        
    } catch (e) {
        logError(e.message);
    } finally {
        butProgram.disabled = !transport;
    }
}

// ... (keep existing toggleUI, sleep, and arrayBufferToBinaryString functions)
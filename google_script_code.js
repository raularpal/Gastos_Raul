// Copia este código en tu editor de Google Apps Script (Extensiones > Apps Script)
// Reemplaza TODO el código existente con este.

function doGet() {
    return handleRead();
}

function doPost(e) {
    return handleWrite(e);
}

function handleRead() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var rows = data.slice(1);

    var result = rows.map(function (row) {
        var obj = {};
        headers.forEach(function (header, i) {
            obj[header] = row[i];
        });
        return obj;
    });

    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleWrite(e) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        var data = JSON.parse(e.postData.contents);

        // Obtener encabezados
        var range = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1);
        var headers = range.getValues()[0];

        // Si la hoja está nueva, crear encabezados basados en el objeto recibido
        if (headers.length === 1 && headers[0] === "") {
            headers = ["id", "date", "type", "sector", "amount", "method", "concept"];
            sheet.appendRow(headers);
        }

        // Mapear datos a columnas
        var row = headers.map(function (header) {
            // Manejar fechas u otros formatos si es necesario
            return data[header] || "";
        });

        sheet.appendRow(row);

        return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

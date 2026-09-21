import Foundation
import Vision
for path in CommandLine.arguments.dropFirst() {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    request.usesCPUOnly = true
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
    try handler.perform([request])
    let values = (request.results ?? []).compactMap { $0.payloadStringValue }
    guard values.count == 1 else { fatalError("Expected one QR: \(path), got \(values)") }
    print(URL(fileURLWithPath: path).lastPathComponent + ": " + values[0])
}

import Foundation
import CoreImage
let context = CIContext(options: [.useSoftwareRenderer: true])
guard let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: context, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]) else { fatalError("No detector") }
for path in CommandLine.arguments.dropFirst() {
 guard let image = CIImage(contentsOf: URL(fileURLWithPath:path)) else {fatalError("No image")}
 let values = detector.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
 guard values.count == 1 else {fatalError("Expected QR: \(values)")}
 print(URL(fileURLWithPath:path).lastPathComponent + ": " + values[0])
}

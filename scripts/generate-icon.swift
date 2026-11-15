import AppKit
let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let context = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.current = context
NSColor(calibratedRed: 0.28, green: 0.36, blue: 0.94, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()
let path = NSBezierPath()
path.lineWidth = 62
path.lineCapStyle = .round
path.lineJoinStyle = .round
path.move(to: NSPoint(x: 352, y: 667)); path.line(to: NSPoint(x: 197, y: 512)); path.line(to: NSPoint(x: 352, y: 357))
path.move(to: NSPoint(x: 672, y: 667)); path.line(to: NSPoint(x: 827, y: 512)); path.line(to: NSPoint(x: 672, y: 357))
path.move(to: NSPoint(x: 555, y: 725)); path.line(to: NSPoint(x: 469, y: 299))
NSColor.white.setStroke(); path.stroke()
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
let opaque = NSBitmapImageRep(cgImage: bitmap.cgImage!)
try opaque.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))

use framework "Foundation"
use framework "AppKit"
use scripting additions

on postMediaKey(keyCode)
    set eventType to 14 -- NSSystemDefined
    
    set data1 to (keyCode * 65536) + (10 * 256)
    set ev1 to current application's NSEvent's otherEventWithType:eventType location:{0, 0} modifierFlags:256 timestamp:0 windowNumber:0 context:(missing value) subtype:8 data1:data1 data2:-1
    
    set cgEvent1 to ev1's CGEvent()
    current application's CGEventPost(0, cgEvent1)
    
    set data1Up to (keyCode * 65536) + (11 * 256)
    set ev2 to current application's NSEvent's otherEventWithType:eventType location:{0, 0} modifierFlags:256 timestamp:0 windowNumber:0 context:(missing value) subtype:8 data1:data1Up data2:-1
    
    set cgEvent2 to ev2's CGEvent()
    current application's CGEventPost(0, cgEvent2)
end postMediaKey

postMediaKey(17)

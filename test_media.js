ObjC.import('CoreGraphics');
function postMediaKey(key) {
    let ev1 = $.CGEventCreateKeyboardEvent(null, key, true);
    $.CGEventSetType(ev1, 14);
    $.CGEventSetIntegerValueField(110, (key << 16) | (0xA << 8));
    $.CGEventPost(0, ev1);
    
    let ev2 = $.CGEventCreateKeyboardEvent(null, key, false);
    $.CGEventSetType(ev2, 14);
    $.CGEventSetIntegerValueField(110, (key << 16) | (0xB << 8));
    $.CGEventPost(0, ev2);
}
postMediaKey(16); // 16 is play/pause

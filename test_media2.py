import ctypes
from ctypes import c_void_p, c_uint32, c_int64, c_uint16, c_bool

CG = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")

CG.CGEventCreateKeyboardEvent.restype = c_void_p
CG.CGEventCreateKeyboardEvent.argtypes = [c_void_p, c_uint16, c_bool]

CG.CGEventSetType.restype = None
CG.CGEventSetType.argtypes = [c_void_p, c_uint32]

CG.CGEventSetIntegerValueField.restype = None
CG.CGEventSetIntegerValueField.argtypes = [c_void_p, c_uint32, c_int64]

CG.CGEventPost.restype = None
CG.CGEventPost.argtypes = [c_uint32, c_void_p]

def post_media_key(key):
    ev1 = CG.CGEventCreateKeyboardEvent(None, 0, True)
    CG.CGEventSetType(ev1, 14)
    CG.CGEventSetIntegerValueField(ev1, 110, (key << 16) | (0xA << 8)) 
    CG.CGEventPost(0, ev1)
    
    ev2 = CG.CGEventCreateKeyboardEvent(None, 0, False)
    CG.CGEventSetType(ev2, 14)
    CG.CGEventSetIntegerValueField(ev2, 110, (key << 16) | (0xB << 8))
    CG.CGEventPost(0, ev2)

post_media_key(17)
print("Done")

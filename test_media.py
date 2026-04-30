import ctypes

CG = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")

CG.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
CG.CGEventSetType.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
CG.CGEventSetIntegerValueField.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int64]

def post_media_key(key):
    # key: Play/Pause=16, Next=17, Prev=18
    ev1 = CG.CGEventCreateKeyboardEvent(None, 0, True)
    CG.CGEventSetType(ev1, 14) # NSSystemDefined
    CG.CGEventSetIntegerValueField(ev1, 110, (key << 16) | (0xA << 8)) # 110 is kCGEventEventData1
    CG.CGEventPost(0, ev1)
    
    ev2 = CG.CGEventCreateKeyboardEvent(None, 0, False)
    CG.CGEventSetType(ev2, 14)
    CG.CGEventSetIntegerValueField(ev2, 110, (key << 16) | (0xB << 8))
    CG.CGEventPost(0, ev2)

post_media_key(17) # Next
print("Media key next sent")

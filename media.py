import sys
import ctypes
CG = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
CG.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
CG.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
CG.CGEventSetType.restype = None
CG.CGEventSetType.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
CG.CGEventSetIntegerValueField.restype = None
CG.CGEventSetIntegerValueField.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int64]
CG.CGEventPost.restype = None
CG.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
def post(k):
    e1 = CG.CGEventCreateKeyboardEvent(None, 0, True)
    if not e1: return
    CG.CGEventSetType(e1, 14)
    CG.CGEventSetIntegerValueField(e1, 110, (k << 16) | (0xA << 8))
    CG.CGEventPost(0, e1)
    e2 = CG.CGEventCreateKeyboardEvent(None, 0, False)
    if not e2: return
    CG.CGEventSetType(e2, 14)
    CG.CGEventSetIntegerValueField(e2, 110, (k << 16) | (0xB << 8))
    CG.CGEventPost(0, e2)
post(int(sys.argv[1]))

"""
DOF Reality H3 を Sim Racing Studio (SRS) 経由で動かす送信側。
SRS が動いている PC(普通は Windows) に UDP 33001 で数値を送るだけ。
モーターの安全管理・滑らかさは SRS がやってくれる。

使い方:
    from h3_srs import SRS
    srs = SRS("192.168.x.x")        # SRS が動いている PC。同じPCなら省略
    srs.send(pitch=5, roll=-3, yaw=0, lat_g=0.4, long_g=-0.2, vert_g=0)
"""
import socket, time
from ctypes import Structure, c_char, c_uint, c_int, c_float

class TelemetryPacket(Structure):
    _fields_ = [('api_mode', c_char * 3), ('version', c_uint),
                ('game', c_char * 50), ('vehicle_name', c_char * 50), ('location', c_char * 50),
                ('speed', c_float), ('rpm', c_float), ('max_rpm', c_float), ('gear', c_int),
                ('pitch', c_float), ('roll', c_float), ('yaw', c_float),
                ('lateral_velocity', c_float), ('lateral_acceleration', c_float),
                ('vertical_acceleration', c_float), ('longitudinal_acceleration', c_float),
                ('suspension_travel_front_left', c_float), ('suspension_travel_front_right', c_float),
                ('suspension_travel_rear_left', c_float), ('suspension_travel_rear_right', c_float),
                ('wheel_terrain_front_left', c_uint), ('wheel_terrain_front_right', c_uint),
                ('wheel_terrain_rear_left', c_uint), ('wheel_terrain_rear_right', c_uint)]

class SRS:
    def __init__(self, host="127.0.0.1", port=33001, game="MyGame"):
        self.addr = (host, port)
        self.game = game.encode()
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    def send(self, pitch=0.0, roll=0.0, yaw=0.0, lat_g=0.0, long_g=0.0, vert_g=0.0,
             lat_vel=0.0, speed=0.0, rpm=0.0, max_rpm=8000.0, gear=1):
        """角度は度(-180..180)、G は -10..10 程度。1秒に30〜60回呼ぶ。"""
        p = TelemetryPacket(b"api", 102, self.game, b"vehicle", b"nowhere",
                            speed, rpm, max_rpm, gear, pitch, roll, yaw,
                            lat_vel, lat_g, vert_g, long_g, 0, 0, 0, 0, 2, 2, 2, 2)
        self.sock.sendto(p, self.addr)

if __name__ == "__main__":
    import math, sys
    srs = SRS(sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1")
    t0 = time.time()
    while time.time() - t0 < 12:
        t = time.time() - t0
        srs.send(roll=math.sin(t * 2) * 10, pitch=math.cos(t) * 5)
        time.sleep(1 / 60)
    srs.send()

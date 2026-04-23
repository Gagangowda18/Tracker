import matplotlib.pyplot as plt

platforms = ['CPU FP32', 'GPU FP32', 'CPU INT8', 'GPU INT8', 'FPGA INT8']
latency = [500, 150, 300, 110, 200]
power = [55, 120, 45, 100, 12]

plt.figure()
plt.scatter(power, latency)

for i, txt in enumerate(platforms):
    plt.annotate(txt, (power[i], latency[i]))

plt.xlabel("Power (W)")
plt.ylabel("Latency (ms)")
plt.title("Latency vs Power Trade-off")

plt.grid()
plt.savefig("latency_power.png")
plt.show()
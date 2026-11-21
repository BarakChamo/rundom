# Four-provider DOM timing and memory, November 20, 2026

Process medians are in milliseconds. Peak RSS and forced-GC checkpoints use MiB. Stage medians are computed independently. Warm is the median of per-process batch medians. Measured work is the median of per-process sums across the measured batches. Total includes Node, the harness, checks and worker exit. Failed screens and incomplete rows remain visible.

## Timing Heavy

| Provider  | Complete scenarios | Attempted | Failed screens | Verified timing trials | Failed timing trials |
| --------- | ------------------ | --------- | -------------- | ---------------------- | -------------------- |
| RunDOM    | 9                  | 9         | 0              | 81                     | 0                    |
| jsdom     | 9                  | 9         | 0              | 81                     | 0                    |
| Happy DOM | 9                  | 9         | 0              | 81                     | 0                    |
| TurboDOM  | 8                  | 9         | 1              | 72                     | 0                    |

| Scenario             | Provider  | Verified | Ops/batch | Load    | Setup  | First  | Warmup  | Warm batch | Measured work | Close | Total   | Peak RSS |
| -------------------- | --------- | -------- | --------- | ------- | ------ | ------ | ------- | ---------- | ------------- | ----- | ------- | -------- |
| windows-create-close | RunDOM    | 9/9      | 8         | 12.959  | 0.342  | 1.866  | 29.709  | 4.462      | 22.778        | 0.048 | 165.798 | 168.0    |
| windows-create-close | jsdom     | 9/9      | 8         | 208.965 | 0.360  | 31.617 | 74.907  | 13.990     | 71.067        | 0.054 | 496.429 | 309.3    |
| windows-create-close | Happy DOM | 9/9      | 8         | 103.238 | 0.363  | 5.771  | 60.374  | 14.518     | 71.561        | 0.068 | 336.513 | 154.6    |
| windows-create-close | TurboDOM  | 9/9      | 8         | 16.487  | 0.325  | 2.000  | 1.400   | 0.077      | 0.398         | 0.025 | 114.325 | 108.0    |
| parse-html           | RunDOM    | 9/9      | 8         | 12.762  | 0.330  | 8.472  | 28.559  | 4.908      | 26.003        | 0.050 | 170.023 | 171.7    |
| parse-html           | jsdom     | 9/9      | 8         | 204.168 | 0.336  | 43.205 | 204.391 | 45.240     | 222.007       | 0.059 | 782.627 | 430.2    |
| parse-html           | Happy DOM | 9/9      | 8         | 101.398 | 0.369  | 12.243 | 134.931 | 28.374     | 139.826       | 0.058 | 487.703 | 196.3    |
| parse-html           | TurboDOM  | 9/9      | 8         | 16.712  | 0.336  | 3.854  | 5.444   | 0.586      | 3.324         | 0.039 | 121.277 | 114.2    |
| parse-html-unique    | RunDOM    | 9/9      | 8         | 13.485  | 0.346  | 6.717  | 53.546  | 8.109      | 40.579        | 0.054 | 221.689 | 209.5    |
| parse-html-unique    | jsdom     | 9/9      | 8         | 216.933 | 0.357  | 44.997 | 217.567 | 45.918     | 228.046       | 0.060 | 823.244 | 429.6    |
| parse-html-unique    | Happy DOM | 9/9      | 8         | 105.764 | 0.373  | 12.398 | 136.429 | 30.430     | 153.200       | 0.061 | 506.454 | 215.2    |
| parse-html-unique    | TurboDOM  | 9/9      | 8         | 16.989  | 0.341  | 3.899  | 20.110  | 4.103      | 21.356        | 0.045 | 155.814 | 122.2    |
| parse-html-sparse    | RunDOM    | 9/9      | 8         | 13.428  | 0.359  | 8.612  | 34.008  | 5.653      | 29.028        | 0.059 | 184.892 | 180.2    |
| parse-html-sparse    | jsdom     | 9/9      | 8         | 214.879 | 0.359  | 45.036 | 206.309 | 44.431     | 217.191       | 0.067 | 799.675 | 435.6    |
| parse-html-sparse    | Happy DOM | 9/9      | 8         | 104.448 | 0.368  | 12.111 | 128.984 | 29.518     | 147.625       | 0.073 | 493.024 | 190.0    |
| parse-html-sparse    | TurboDOM  | 9/9      | 8         | 16.939  | 0.335  | 3.353  | 5.434   | 0.808      | 3.726         | 0.034 | 122.025 | 113.5    |
| parse-html-update    | RunDOM    | 9/9      | 8         | 13.239  | 0.354  | 9.463  | 42.459  | 6.322      | 32.131        | 0.053 | 204.136 | 185.8    |
| parse-html-update    | jsdom     | 9/9      | 8         | 213.050 | 0.351  | 45.468 | 216.349 | 46.226     | 228.914       | 0.058 | 829.167 | 454.0    |
| parse-html-update    | Happy DOM | 9/9      | 8         | 105.907 | 0.371  | 12.860 | 142.989 | 28.740     | 143.616       | 0.060 | 502.501 | 196.5    |
| parse-html-update    | TurboDOM  | 9/9      | 8         | 16.771  | 0.348  | 4.745  | 8.706   | 0.923      | 4.844         | 0.036 | 128.651 | 117.4    |
| parse-html-rotate    | RunDOM    | 9/9      | 8         | 13.513  | 0.358  | 6.844  | 43.635  | 5.157      | 26.305        | 0.050 | 189.880 | 181.4    |
| parse-html-rotate    | jsdom     | 9/9      | 8         | 217.914 | 0.358  | 44.983 | 215.077 | 45.762     | 222.336       | 0.060 | 814.225 | 430.3    |
| parse-html-rotate    | Happy DOM | 9/9      | 8         | 104.904 | 0.370  | 12.666 | 133.394 | 28.848     | 145.726       | 0.059 | 501.705 | 203.2    |
| parse-html-rotate    | TurboDOM  | 9/9      | 8         | 17.057  | 0.343  | 3.974  | 7.085   | 0.658      | 3.778         | 0.035 | 126.219 | 115.7    |
| parse-html-traverse  | RunDOM    | 9/9      | 8         | 13.494  | 0.359  | 7.758  | 46.328  | 6.404      | 32.664        | 0.053 | 206.321 | 183.6    |
| parse-html-traverse  | jsdom     | 9/9      | 8         | 213.623 | 0.356  | 45.416 | 218.632 | 46.104     | 228.495       | 0.060 | 829.550 | 453.3    |
| parse-html-traverse  | Happy DOM | 9/9      | 8         | 104.097 | 0.364  | 12.330 | 144.224 | 28.638     | 142.731       | 0.069 | 500.333 | 195.3    |
| parse-html-traverse  | TurboDOM  | 9/9      | 8         | 16.747  | 0.340  | 4.234  | 6.336   | 0.628      | 3.638         | 0.035 | 124.308 | 114.8    |
| clone-subtree        | RunDOM    | 9/9      | 8         | 13.550  | 6.586  | 0.833  | 8.001   | 0.718      | 3.632         | 0.061 | 130.048 | 118.9    |
| clone-subtree        | jsdom     | 9/9      | 8         | 212.626 | 40.691 | 3.357  | 47.191  | 8.582      | 42.717        | 0.170 | 463.161 | 299.3    |
| clone-subtree        | Happy DOM | 9/9      | 8         | 104.117 | 9.838  | 4.387  | 62.348  | 7.866      | 55.953        | 1.812 | 355.709 | 336.5    |
| clone-subtree        | TurboDOM  | 0/9      | —         | —       | —      | —      | —       | —          | —             | —     | —       | —        |
| serialize            | RunDOM    | 9/9      | 8         | 13.563  | 8.581  | 0.527  | 4.025   | 0.649      | 3.119         | 0.054 | 126.956 | 116.9    |
| serialize            | jsdom     | 9/9      | 8         | 217.655 | 41.022 | 0.753  | 14.475  | 0.658      | 3.801         | 0.148 | 377.232 | 223.9    |
| serialize            | Happy DOM | 9/9      | 8         | 104.078 | 9.797  | 0.658  | 7.088   | 0.923      | 4.621         | 1.549 | 224.874 | 145.6    |
| serialize            | TurboDOM  | 9/9      | 8         | 17.522  | 3.529  | 1.616  | 9.900   | 1.665      | 8.483         | 0.064 | 136.205 | 118.8    |

| Scenario      | Provider | Stage  | Reason                                                            |
| ------------- | -------- | ------ | ----------------------------------------------------------------- |
| clone-subtree | TurboDOM | screen | worker_exit_1_null TypeError: clone.isEqualNode is not a function |

## Timing Light

| Provider  | Complete scenarios | Attempted | Failed screens | Verified timing trials | Failed timing trials |
| --------- | ------------------ | --------- | -------------- | ---------------------- | -------------------- |
| RunDOM    | 35                 | 35        | 0              | 315                    | 0                    |
| jsdom     | 34                 | 35        | 1              | 306                    | 0                    |
| Happy DOM | 29                 | 35        | 6              | 261                    | 0                    |
| TurboDOM  | 28                 | 35        | 7              | 252                    | 0                    |

| Scenario                  | Provider  | Verified | Ops/batch | Load    | Setup   | First  | Warmup  | Warm batch | Measured work | Close  | Total     | Peak RSS |
| ------------------------- | --------- | -------- | --------- | ------- | ------- | ------ | ------- | ---------- | ------------- | ------ | --------- | -------- |
| control                   | RunDOM    | 9/9      | 64        | 13.775  | 0.360   | 0.011  | 0.281   | 0.001      | 0.014         | 0.019  | 108.859   | 105.6    |
| control                   | jsdom     | 9/9      | 64        | 221.730 | 0.365   | 0.011  | 0.316   | 0.001      | 0.015         | 0.021  | 333.039   | 185.2    |
| control                   | Happy DOM | 9/9      | 64        | 103.824 | 0.358   | 0.011  | 0.165   | 0.001      | 0.013         | 0.025  | 201.446   | 126.3    |
| control                   | TurboDOM  | 9/9      | 64        | 17.006  | 0.341   | 0.011  | 0.900   | 0.001      | 0.015         | 0.021  | 112.766   | 106.9    |
| fragment-write            | RunDOM    | 9/9      | 64        | 12.975  | 8.146   | 1.065  | 5.014   | 0.613      | 3.220         | 0.066  | 119.518   | 109.8    |
| fragment-write            | jsdom     | 9/9      | 64        | 212.061 | 40.526  | 1.157  | 15.276  | 2.117      | 10.194        | 0.143  | 379.157   | 224.5    |
| fragment-write            | Happy DOM | 9/9      | 64        | 100.591 | 9.688   | 0.228  | 4.151   | 1.022      | 4.757         | 1.423  | 217.069   | 149.3    |
| fragment-write            | TurboDOM  | 9/9      | 64        | 16.830  | 3.180   | 0.326  | 2.753   | 0.696      | 3.549         | 0.047  | 117.245   | 109.0    |
| fragment-table            | RunDOM    | 9/9      | 64        | 13.155  | 3.997   | 4.809  | 79.143  | 27.416     | 146.525       | 0.093  | 354.110   | 321.1    |
| fragment-table            | jsdom     | 9/9      | 64        | 214.880 | 34.108  | 13.202 | 359.782 | 156.312    | 784.744       | 0.201  | 1,523.493 | 469.5    |
| fragment-table            | Happy DOM | 9/9      | 64        | 100.208 | 5.206   | 5.461  | 343.055 | 163.521    | 825.271       | 2.231  | 1,447.795 | 846.3    |
| fragment-table            | TurboDOM  | 9/9      | 64        | 19.205  | 2.683   | 3.682  | 210.123 | 91.812     | 465.572       | 0.085  | 810.365   | 155.5    |
| fragment-table-read       | RunDOM    | 9/9      | 64        | 12.973  | 3.872   | 5.295  | 71.925  | 32.136     | 167.120       | 0.090  | 362.724   | 316.3    |
| fragment-table-read       | jsdom     | 9/9      | 64        | 219.043 | 34.632  | 13.730 | 384.215 | 167.820    | 838.646       | 0.195  | 1,600.112 | 471.7    |
| fragment-table-read       | Happy DOM | 9/9      | 64        | 106.177 | 5.165   | 5.550  | 340.008 | 164.206    | 810.062       | 2.145  | 1,417.073 | 863.4    |
| fragment-table-read       | TurboDOM  | 9/9      | 64        | 19.315  | 2.823   | 4.000  | 215.000 | 94.236     | 471.099       | 0.087  | 819.638   | 155.5    |
| fragment-list             | RunDOM    | 9/9      | 64        | 13.720  | 3.922   | 4.476  | 61.617  | 19.459     | 101.050       | 0.096  | 292.139   | 233.7    |
| fragment-list             | jsdom     | 9/9      | 64        | 224.759 | 34.468  | 11.456 | 265.388 | 109.649    | 552.578       | 0.198  | 1,200.028 | 437.0    |
| fragment-list             | Happy DOM | 9/9      | 64        | 103.166 | 5.163   | 3.678  | 199.420 | 80.695     | 429.065       | 1.953  | 874.589   | 638.9    |
| fragment-list             | TurboDOM  | 9/9      | 64        | 19.160  | 2.692   | 2.977  | 154.348 | 67.625     | 335.494       | 0.083  | 624.493   | 147.0    |
| fragment-list-read        | RunDOM    | 9/9      | 64        | 13.795  | 3.914   | 4.616  | 58.562  | 21.404     | 111.774       | 0.088  | 306.477   | 229.3    |
| fragment-list-read        | jsdom     | 9/9      | 64        | 221.131 | 34.495  | 11.726 | 275.995 | 115.873    | 580.922       | 0.198  | 1,228.457 | 438.4    |
| fragment-list-read        | Happy DOM | 9/9      | 64        | 105.710 | 5.125   | 3.900  | 200.101 | 81.899     | 436.840       | 1.838  | 881.432   | 640.1    |
| fragment-list-read        | TurboDOM  | 9/9      | 64        | 19.088  | 2.708   | 2.913  | 153.959 | 66.007     | 329.063       | 0.082  | 617.302   | 147.2    |
| read-tree                 | RunDOM    | 9/9      | 64        | 13.375  | 8.164   | 0.240  | 0.881   | 0.037      | 0.182         | 0.036  | 115.642   | 108.5    |
| read-tree                 | jsdom     | 9/9      | 64        | 218.423 | 40.754  | 0.302  | 3.906   | 0.121      | 0.635         | 0.149  | 374.907   | 222.9    |
| read-tree                 | Happy DOM | 9/9      | 64        | 102.984 | 9.461   | 0.098  | 1.416   | 0.017      | 0.093         | 1.319  | 210.466   | 133.9    |
| read-tree                 | TurboDOM  | 9/9      | 64        | 16.832  | 3.853   | 0.130  | 0.241   | 0.019      | 0.107         | 0.034  | 114.754   | 108.6    |
| query-id-hit              | RunDOM    | 9/9      | 64        | 13.100  | 8.162   | 0.028  | 0.707   | 0.016      | 0.085         | 0.035  | 113.602   | 109.1    |
| query-id-hit              | jsdom     | 9/9      | 64        | 209.383 | 40.521  | 0.019  | 3.649   | 0.035      | 0.202         | 0.131  | 353.054   | 222.6    |
| query-id-hit              | Happy DOM | 9/9      | 64        | 100.229 | 9.706   | 0.018  | 1.368   | 0.008      | 0.048         | 1.339  | 205.467   | 133.9    |
| query-id-hit              | TurboDOM  | 9/9      | 64        | 16.868  | 3.102   | 0.016  | 0.879   | 0.006      | 0.037         | 0.032  | 113.780   | 108.5    |
| query-id-miss             | RunDOM    | 9/9      | 64        | 12.823  | 7.912   | 0.128  | 0.758   | 0.012      | 0.083         | 0.036  | 113.215   | 108.8    |
| query-id-miss             | jsdom     | 9/9      | 64        | 207.543 | 39.211  | 0.019  | 3.599   | 0.032      | 0.194         | 0.136  | 352.951   | 222.4    |
| query-id-miss             | Happy DOM | 9/9      | 64        | 99.571  | 9.246   | 0.017  | 1.358   | 0.007      | 0.044         | 1.347  | 201.724   | 133.9    |
| query-id-miss             | TurboDOM  | 9/9      | 64        | 16.329  | 3.080   | 0.242  | 0.206   | 0.005      | 0.035         | 0.034  | 111.812   | 108.7    |
| query-simple              | RunDOM    | 9/9      | 64        | 13.055  | 8.177   | 0.377  | 0.699   | 0.023      | 0.117         | 0.035  | 112.935   | 109.0    |
| query-simple              | jsdom     | 9/9      | 64        | 208.734 | 39.565  | 4.100  | 6.126   | 0.849      | 3.473         | 0.155  | 361.757   | 224.4    |
| query-simple              | Happy DOM | 9/9      | 64        | 99.088  | 9.338   | 0.781  | 1.394   | 0.008      | 0.055         | 1.288  | 203.007   | 134.1    |
| query-simple              | TurboDOM  | 9/9      | 64        | 16.096  | 3.032   | 0.156  | 0.900   | 0.006      | 0.042         | 0.032  | 111.405   | 108.6    |
| query-complex             | RunDOM    | 9/9      | 64        | 13.218  | 8.267   | 10.888 | 0.665   | 0.025      | 0.119         | 0.039  | 124.570   | 114.6    |
| query-complex             | jsdom     | 9/9      | 64        | 209.395 | 40.270  | 5.267  | 10.413  | 0.940      | 4.846         | 0.146  | 367.342   | 225.1    |
| query-complex             | Happy DOM | 9/9      | 64        | 100.515 | 9.306   | 1.053  | 1.472   | 0.009      | 0.060         | 1.352  | 206.786   | 133.8    |
| query-complex             | TurboDOM  | 9/9      | 64        | 16.628  | 3.077   | 0.828  | 0.910   | 0.006      | 0.045         | 0.036  | 114.034   | 108.8    |
| query-all                 | RunDOM    | 9/9      | 64        | 13.245  | 7.734   | 0.706  | 0.863   | 0.054      | 0.259         | 0.041  | 112.558   | 108.8    |
| query-all                 | jsdom     | 9/9      | 64        | 211.300 | 39.445  | 4.364  | 13.092  | 2.273      | 11.380        | 0.150  | 374.718   | 224.8    |
| query-all                 | Happy DOM | 9/9      | 64        | 100.329 | 9.460   | 1.415  | 1.446   | 0.012      | 0.065         | 1.388  | 205.924   | 134.3    |
| query-all                 | TurboDOM  | 9/9      | 64        | 16.431  | 3.109   | 0.418  | 0.203   | 0.007      | 0.042         | 0.033  | 111.922   | 108.7    |
| query-all-iterate         | RunDOM    | 9/9      | 64        | 12.909  | 8.140   | 1.147  | 7.261   | 2.368      | 12.064        | 0.055  | 133.050   | 113.8    |
| query-all-iterate         | jsdom     | 9/9      | 64        | 209.471 | 40.196  | 4.739  | 24.115  | 6.891      | 34.321        | 0.163  | 406.238   | 240.4    |
| query-all-iterate         | Happy DOM | 9/9      | 64        | 100.919 | 9.442   | 1.561  | 5.610   | 1.685      | 8.633         | 1.456  | 220.991   | 135.9    |
| query-all-iterate         | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| query-snapshot            | RunDOM    | 9/9      | 64        | 13.129  | 6.711   | 2.040  | 8.242   | 1.908      | 9.375         | 0.078  | 132.099   | 118.2    |
| query-snapshot            | jsdom     | 9/9      | 64        | 214.178 | 40.439  | 5.515  | 37.972  | 12.810     | 64.133        | 0.169  | 459.483   | 251.0    |
| query-snapshot            | Happy DOM | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| query-snapshot            | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| query-after-mutation      | RunDOM    | 9/9      | 64        | 13.528  | 8.348   | 0.777  | 2.414   | 0.505      | 2.598         | 0.052  | 121.162   | 111.0    |
| query-after-mutation      | jsdom     | 9/9      | 64        | 214.362 | 40.581  | 4.947  | 20.146  | 4.948      | 24.575        | 0.173  | 400.776   | 225.8    |
| query-after-mutation      | Happy DOM | 9/9      | 64        | 102.567 | 9.622   | 1.331  | 7.191   | 2.205      | 11.046        | 1.877  | 228.516   | 146.2    |
| query-after-mutation      | TurboDOM  | 9/9      | 64        | 16.817  | 3.103   | 1.093  | 3.352   | 0.379      | 2.396         | 0.051  | 119.538   | 109.4    |
| query-diverse             | RunDOM    | 9/9      | 64        | 13.406  | 8.125   | 12.776 | 4.831   | 0.182      | 2.609         | 0.052  | 135.332   | 117.9    |
| query-diverse             | jsdom     | 9/9      | 64        | 214.768 | 40.839  | 4.637  | 20.357  | 3.439      | 18.575        | 0.158  | 396.877   | 224.9    |
| query-diverse             | Happy DOM | 9/9      | 64        | 102.763 | 9.594   | 1.015  | 10.509  | 0.040      | 6.765         | 1.960  | 227.703   | 146.6    |
| query-diverse             | TurboDOM  | 9/9      | 64        | 16.838  | 3.131   | 1.502  | 5.603   | 0.020      | 2.087         | 0.049  | 122.240   | 109.9    |
| query-batched-mutation    | RunDOM    | 9/9      | 64        | 13.559  | 8.182   | 11.821 | 6.642   | 0.590      | 4.836         | 0.058  | 140.201   | 123.5    |
| query-batched-mutation    | jsdom     | 9/9      | 64        | 212.858 | 40.515  | 4.753  | 20.628  | 4.113      | 20.448        | 0.154  | 400.683   | 224.9    |
| query-batched-mutation    | Happy DOM | 9/9      | 64        | 102.845 | 9.600   | 1.065  | 11.081  | 3.511      | 17.374        | 2.277  | 244.045   | 146.9    |
| query-batched-mutation    | TurboDOM  | 9/9      | 64        | 16.939  | 3.245   | 1.593  | 5.936   | 0.984      | 4.784         | 0.054  | 126.295   | 112.4    |
| list-reconcile            | RunDOM    | 9/9      | 64        | 13.616  | 8.233   | 2.697  | 8.711   | 1.897      | 9.873         | 0.079  | 138.685   | 119.2    |
| list-reconcile            | jsdom     | 9/9      | 64        | 216.381 | 41.223  | 6.056  | 31.659  | 9.885      | 49.653        | 0.172  | 442.523   | 249.3    |
| list-reconcile            | Happy DOM | 9/9      | 64        | 104.353 | 9.598   | 2.393  | 27.807  | 11.218     | 54.333        | 1.791  | 297.048   | 195.6    |
| list-reconcile            | TurboDOM  | 9/9      | 64        | 17.806  | 3.348   | 1.830  | 12.413  | 2.795      | 14.178        | 0.062  | 145.297   | 117.8    |
| interaction-state         | RunDOM    | 9/9      | 64        | 13.494  | 21.727  | 28.227 | 12.391  | 2.088      | 10.837        | 0.124  | 188.293   | 166.1    |
| interaction-state         | jsdom     | 9/9      | 64        | 214.863 | 48.615  | 36.128 | 59.039  | 20.826     | 105.481       | 0.265  | 560.910   | 287.6    |
| interaction-state         | Happy DOM | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| interaction-state         | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| write-attribute           | RunDOM    | 9/9      | 64        | 13.636  | 6.633   | 0.311  | 1.062   | 0.107      | 0.560         | 0.050  | 120.856   | 108.8    |
| write-attribute           | jsdom     | 9/9      | 64        | 215.447 | 40.919  | 0.177  | 4.017   | 0.141      | 0.724         | 0.138  | 367.095   | 222.6    |
| write-attribute           | Happy DOM | 9/9      | 64        | 100.503 | 9.746   | 0.093  | 1.700   | 0.109      | 0.562         | 1.381  | 208.801   | 133.8    |
| write-attribute           | TurboDOM  | 9/9      | 64        | 17.469  | 3.197   | 0.084  | 0.967   | 0.025      | 0.139         | 0.033  | 118.271   | 108.5    |
| write-text                | RunDOM    | 9/9      | 64        | 13.129  | 8.306   | 0.538  | 1.068   | 0.119      | 0.568         | 0.049  | 115.110   | 109.2    |
| write-text                | jsdom     | 9/9      | 64        | 208.381 | 40.748  | 0.324  | 4.585   | 0.428      | 2.220         | 0.152  | 355.734   | 222.8    |
| write-text                | Happy DOM | 9/9      | 64        | 99.377  | 9.685   | 0.085  | 1.788   | 0.155      | 0.757         | 1.326  | 206.367   | 133.9    |
| write-text                | TurboDOM  | 9/9      | 64        | 16.704  | 3.109   | 0.141  | 1.022   | 0.056      | 0.286         | 0.036  | 114.040   | 108.6    |
| append-remove             | RunDOM    | 9/9      | 64        | 12.915  | 8.184   | 0.875  | 1.607   | 0.218      | 1.096         | 0.056  | 113.209   | 110.1    |
| append-remove             | jsdom     | 9/9      | 64        | 208.505 | 39.226  | 0.460  | 5.376   | 0.783      | 3.765         | 0.148  | 356.011   | 223.7    |
| append-remove             | Happy DOM | 9/9      | 64        | 98.584  | 9.284   | 0.123  | 2.077   | 0.282      | 1.401         | 1.350  | 203.708   | 134.4    |
| append-remove             | TurboDOM  | 9/9      | 64        | 16.137  | 3.023   | 0.157  | 0.993   | 0.064      | 0.321         | 0.034  | 110.105   | 108.6    |
| events-construct          | RunDOM    | 9/9      | 64        | 12.636  | 8.015   | 0.066  | 0.737   | 0.050      | 0.242         | 0.037  | 110.983   | 108.7    |
| events-construct          | jsdom     | 9/9      | 64        | 208.853 | 39.028  | 0.093  | 3.929   | 0.203      | 1.030         | 0.167  | 351.444   | 222.5    |
| events-construct          | Happy DOM | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| events-construct          | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| events-redispatch         | RunDOM    | 9/9      | 64        | 12.662  | 8.239   | 0.345  | 0.953   | 0.173      | 0.843         | 0.111  | 112.251   | 109.2    |
| events-redispatch         | jsdom     | 9/9      | 64        | 208.101 | 39.542  | 0.202  | 4.460   | 0.408      | 2.063         | 0.248  | 351.296   | 222.8    |
| events-redispatch         | Happy DOM | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| events-redispatch         | TurboDOM  | 9/9      | 64        | 16.727  | 3.188   | 0.150  | 1.183   | 0.130      | 0.661         | 0.059  | 112.167   | 108.6    |
| events-dispatch           | RunDOM    | 9/9      | 64        | 13.065  | 7.955   | 0.376  | 1.314   | 0.202      | 1.254         | 0.104  | 112.824   | 109.1    |
| events-dispatch           | jsdom     | 9/9      | 64        | 210.807 | 40.435  | 0.217  | 4.768   | 0.512      | 2.565         | 0.231  | 357.123   | 223.2    |
| events-dispatch           | Happy DOM | 9/9      | 64        | 103.717 | 9.405   | 0.271  | 2.089   | 0.224      | 1.156         | 1.336  | 208.738   | 133.9    |
| events-dispatch           | TurboDOM  | 9/9      | 64        | 16.960  | 3.305   | 0.164  | 1.211   | 0.139      | 0.704         | 0.063  | 112.249   | 108.6    |
| events-default-action     | RunDOM    | 9/9      | 64        | 12.906  | 8.340   | 0.880  | 1.971   | 0.379      | 1.956         | 0.043  | 117.531   | 109.4    |
| events-default-action     | jsdom     | 9/9      | 64        | 207.863 | 39.561  | 0.474  | 6.513   | 1.008      | 4.695         | 0.145  | 355.820   | 224.7    |
| events-default-action     | Happy DOM | 9/9      | 64        | 100.537 | 9.666   | 0.568  | 2.910   | 0.487      | 2.419         | 1.448  | 207.191   | 134.9    |
| events-default-action     | TurboDOM  | 9/9      | 64        | 16.750  | 4.010   | 0.285  | 0.812   | 0.165      | 0.909         | 0.056  | 114.298   | 109.4    |
| mutation-observer         | RunDOM    | 9/9      | 64        | 13.141  | 8.528   | 1.013  | 0.819   | 0.162      | 0.792         | 0.067  | 116.294   | 109.9    |
| mutation-observer         | jsdom     | 9/9      | 64        | 210.716 | 40.629  | 3.763  | 0.785   | 0.192      | 0.998         | 0.162  | 360.379   | 222.0    |
| mutation-observer         | Happy DOM | 9/9      | 64        | 100.687 | 9.540   | 1.391  | 0.629   | 0.153      | 0.766         | 1.291  | 207.215   | 133.8    |
| mutation-observer         | TurboDOM  | 9/9      | 64        | 16.870  | 3.206   | 0.933  | 0.300   | 0.047      | 0.253         | 0.056  | 114.863   | 108.5    |
| style-read                | RunDOM    | 9/9      | 64        | 13.147  | 20.330  | 17.295 | 2.199   | 0.068      | 0.325         | 0.051  | 144.939   | 140.9    |
| style-read                | jsdom     | 9/9      | 64        | 210.300 | 52.416  | 29.447 | 0.849   | 0.157      | 0.791         | 0.116  | 395.672   | 229.9    |
| style-read                | Happy DOM | 9/9      | 64        | 100.455 | 9.586   | 3.297  | 1.435   | 0.021      | 0.118         | 1.386  | 209.462   | 134.3    |
| style-read                | TurboDOM  | 9/9      | 64        | 16.742  | 3.222   | 2.053  | 0.335   | 0.069      | 0.376         | 0.040  | 114.496   | 109.0    |
| style-snapshot            | RunDOM    | 9/9      | 64        | 13.114  | 20.637  | 18.880 | 12.555  | 2.369      | 12.258        | 0.076  | 171.028   | 173.3    |
| style-snapshot            | jsdom     | 9/9      | 64        | 211.214 | 52.587  | 31.102 | 62.273  | 22.694     | 113.981       | 0.188  | 570.137   | 295.4    |
| style-snapshot            | Happy DOM | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| style-snapshot            | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| style-inline-invalidation | RunDOM    | 9/9      | 64        | 13.762  | 21.059  | 18.244 | 9.893   | 1.257      | 6.803         | 0.069  | 171.401   | 160.4    |
| style-inline-invalidation | jsdom     | 9/9      | 64        | 217.473 | 53.261  | 29.258 | 37.828  | 12.253     | 61.932        | 0.188  | 499.030   | 286.3    |
| style-inline-invalidation | Happy DOM | 9/9      | 64        | 104.957 | 9.948   | 3.825  | 21.284  | 8.004      | 41.403        | 3.738  | 283.395   | 165.8    |
| style-inline-invalidation | TurboDOM  | 9/9      | 64        | 17.613  | 3.402   | 3.472  | 7.713   | 1.722      | 8.761         | 0.057  | 135.155   | 118.2    |
| style-rule-invalidation   | RunDOM    | 9/9      | 64        | 13.565  | 36.986  | 2.844  | 8.046   | 0.895      | 4.882         | 0.062  | 170.493   | 160.6    |
| style-rule-invalidation   | jsdom     | 9/9      | 64        | 217.309 | 53.370  | 29.410 | 33.527  | 10.533     | 52.540        | 0.178  | 489.290   | 279.5    |
| style-rule-invalidation   | Happy DOM | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| style-rule-invalidation   | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| style-inheritance         | RunDOM    | 9/9      | 64        | 13.463  | 21.430  | 18.935 | 12.669  | 2.201      | 11.208        | 0.073  | 178.212   | 173.9    |
| style-inheritance         | jsdom     | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| style-inheritance         | Happy DOM | 9/9      | 64        | 105.010 | 9.794   | 3.714  | 18.778  | 6.586      | 34.055        | 3.606  | 270.149   | 158.8    |
| style-inheritance         | TurboDOM  | 0/9      | —         | —       | —       | —      | —       | —          | —             | —      | —         | —        |
| role-query                | RunDOM    | 9/9      | 64        | 13.402  | 34.391  | 5.635  | 4.881   | 1.042      | 5.499         | 0.056  | 157.443   | 121.1    |
| role-query                | jsdom     | 9/9      | 64        | 214.014 | 71.046  | 36.537 | 77.654  | 33.410     | 166.194       | 0.198  | 664.578   | 265.0    |
| role-query                | Happy DOM | 9/9      | 64        | 106.500 | 34.798  | 3.878  | 4.567   | 0.778      | 3.865         | 1.577  | 253.850   | 149.2    |
| role-query                | TurboDOM  | 9/9      | 64        | 17.733  | 30.154  | 3.000  | 3.047   | 0.838      | 3.749         | 0.069  | 153.419   | 119.2    |
| windows-live              | RunDOM    | 9/9      | 64        | 13.488  | 15.655  | 0.352  | 3.654   | 0.109      | 0.493         | 0.065  | 126.361   | 116.2    |
| windows-live              | jsdom     | 9/9      | 64        | 212.292 | 85.464  | 0.223  | 1.881   | 0.200      | 1.014         | 0.135  | 404.787   | 230.4    |
| windows-live              | Happy DOM | 9/9      | 64        | 100.818 | 38.704  | 0.133  | 4.276   | 0.198      | 0.988         | 7.883  | 252.813   | 183.4    |
| windows-live              | TurboDOM  | 9/9      | 64        | 16.861  | 4.165   | 0.103  | 2.323   | 0.106      | 0.554         | 0.046  | 117.197   | 109.3    |
| windows-style-live        | RunDOM    | 9/9      | 64        | 13.893  | 32.617  | 21.120 | 6.341   | 0.942      | 4.741         | 0.080  | 182.743   | 164.2    |
| windows-style-live        | jsdom     | 9/9      | 64        | 215.116 | 111.863 | 24.809 | 53.788  | 12.735     | 63.903        | 0.237  | 575.892   | 300.2    |
| windows-style-live        | Happy DOM | 9/9      | 64        | 104.595 | 40.868  | 3.669  | 34.761  | 7.883      | 39.637        | 10.762 | 330.752   | 218.0    |
| windows-style-live        | TurboDOM  | 9/9      | 64        | 17.479  | 4.397   | 1.606  | 6.791   | 1.400      | 7.164         | 0.075  | 133.755   | 118.2    |

| Scenario                | Provider  | Stage  | Reason                                                                                                                 |
| ----------------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| query-all-iterate       | TurboDOM  | screen | worker_exit_1_null TypeError: results.item is not a function                                                           |
| query-snapshot          | Happy DOM | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario query-snapshot did not perform equal checked work          |
| query-snapshot          | TurboDOM  | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario query-snapshot did not perform equal checked work          |
| interaction-state       | Happy DOM | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario interaction-state did not perform equal checked work       |
| interaction-state       | TurboDOM  | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario interaction-state did not perform equal checked work       |
| events-construct        | Happy DOM | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Event construction requires the own unforgeable trust getter        |
| events-construct        | TurboDOM  | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Event construction requires the own unforgeable trust getter        |
| events-redispatch       | Happy DOM | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario events-redispatch did not perform equal checked work       |
| style-snapshot          | Happy DOM | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario style-snapshot did not perform equal checked work          |
| style-snapshot          | TurboDOM  | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario style-snapshot did not perform equal checked work          |
| style-rule-invalidation | Happy DOM | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario style-rule-invalidation did not perform equal checked work |
| style-rule-invalidation | TurboDOM  | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Expected CSSStyleRule                                               |
| style-inheritance       | jsdom     | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario style-inheritance did not perform equal checked work       |
| style-inheritance       | TurboDOM  | screen | worker_exit_1_null AssertionError [ERR_ASSERTION]: Scenario style-inheritance did not perform equal checked work       |

## Dense

| Provider  | Complete scenarios | Attempted | Failed screens | Verified timing trials | Failed timing trials |
| --------- | ------------------ | --------- | -------------- | ---------------------- | -------------------- |
| RunDOM    | 6                  | 6         | 0              | 54                     | 0                    |
| jsdom     | 6                  | 6         | 0              | 54                     | 0                    |
| Happy DOM | 6                  | 6         | 0              | 54                     | 0                    |
| TurboDOM  | 6                  | 6         | 0              | 54                     | 0                    |

| Scenario            | Provider  | Verified | Ops/batch | Load    | Setup  | First  | Warmup  | Warm batch | Measured work | Close  | Total     | Peak RSS |
| ------------------- | --------- | -------- | --------- | ------- | ------ | ------ | ------- | ---------- | ------------- | ------ | --------- | -------- |
| parse-html-sparse   | RunDOM    | 9/9      | 4         | 13.835  | 0.759  | 18.230 | 35.071  | 4.513      | 23.587        | 0.053  | 189.596   | 164.4    |
| parse-html-sparse   | jsdom     | 9/9      | 4         | 219.127 | 0.732  | 76.540 | 449.357 | 132.005    | 660.053       | 0.058  | 1,533.363 | 512.8    |
| parse-html-sparse   | Happy DOM | 9/9      | 4         | 102.529 | 0.730  | 56.172 | 673.203 | 221.054    | 1,095.303     | 0.070  | 2,035.665 | 618.3    |
| parse-html-sparse   | TurboDOM  | 9/9      | 4         | 17.857  | 1.636  | 13.636 | 17.074  | 3.156      | 15.632        | 0.050  | 163.751   | 140.7    |
| parse-html-traverse | RunDOM    | 9/9      | 4         | 13.649  | 0.741  | 21.348 | 61.473  | 11.909     | 60.786        | 0.060  | 273.951   | 211.5    |
| parse-html-traverse | jsdom     | 9/9      | 4         | 220.575 | 0.752  | 86.172 | 546.043 | 157.142    | 793.122       | 0.060  | 1,780.136 | 551.7    |
| parse-html-traverse | Happy DOM | 9/9      | 4         | 100.610 | 0.736  | 68.829 | 843.161 | 269.838    | 1,360.634     | 0.066  | 2,488.283 | 638.3    |
| parse-html-traverse | TurboDOM  | 9/9      | 4         | 17.870  | 1.701  | 13.936 | 18.412  | 3.278      | 17.167        | 0.052  | 166.964   | 140.3    |
| parse-html-update   | RunDOM    | 9/9      | 4         | 13.640  | 0.746  | 19.691 | 51.787  | 9.017      | 46.397        | 0.057  | 234.978   | 196.9    |
| parse-html-update   | jsdom     | 9/9      | 4         | 220.658 | 0.749  | 83.232 | 510.321 | 151.576    | 754.001       | 0.061  | 1,694.958 | 558.2    |
| parse-html-update   | Happy DOM | 9/9      | 4         | 101.963 | 0.720  | 65.160 | 822.131 | 262.284    | 1,303.154     | 0.066  | 2,406.293 | 664.5    |
| parse-html-update   | TurboDOM  | 9/9      | 4         | 17.994  | 1.665  | 15.577 | 27.845  | 6.547      | 32.782        | 0.052  | 198.372   | 143.8    |
| parse-html-rotate   | RunDOM    | 9/9      | 4         | 13.715  | 0.747  | 18.814 | 75.141  | 4.108      | 22.079        | 0.055  | 237.241   | 205.6    |
| parse-html-rotate   | jsdom     | 9/9      | 4         | 219.879 | 0.748  | 82.333 | 514.932 | 151.236    | 759.771       | 0.061  | 1,704.901 | 560.6    |
| parse-html-rotate   | Happy DOM | 9/9      | 4         | 102.003 | 0.722  | 64.898 | 810.404 | 261.460    | 1,307.340     | 0.067  | 2,405.271 | 663.8    |
| parse-html-rotate   | TurboDOM  | 9/9      | 4         | 17.863  | 1.710  | 13.255 | 37.951  | 3.197      | 16.307        | 0.052  | 186.195   | 152.2    |
| parse-html-unique   | RunDOM    | 9/9      | 4         | 13.548  | 0.731  | 18.632 | 89.980  | 30.506     | 156.049       | 0.058  | 378.969   | 326.2    |
| parse-html-unique   | jsdom     | 9/9      | 4         | 220.732 | 0.752  | 80.967 | 508.526 | 151.381    | 759.079       | 0.063  | 1,692.272 | 560.8    |
| parse-html-unique   | Happy DOM | 9/9      | 4         | 100.761 | 0.748  | 65.069 | 816.198 | 261.438    | 1,304.271     | 0.068  | 2,412.105 | 663.4    |
| parse-html-unique   | TurboDOM  | 9/9      | 4         | 18.045  | 1.691  | 13.490 | 98.438  | 30.168     | 150.967       | 0.054  | 387.185   | 203.9    |
| list-reconcile      | RunDOM    | 9/9      | 4         | 13.605  | 16.591 | 5.088  | 6.293   | 0.859      | 4.317         | 0.056  | 144.857   | 122.4    |
| list-reconcile      | jsdom     | 9/9      | 4         | 218.914 | 71.109 | 13.151 | 39.465  | 6.292      | 31.910        | 0.175  | 474.729   | 243.0    |
| list-reconcile      | Happy DOM | 9/9      | 4         | 104.913 | 48.953 | 13.702 | 58.108  | 9.466      | 47.578        | 11.586 | 387.366   | 267.2    |
| list-reconcile      | TurboDOM  | 9/9      | 4         | 17.697  | 13.453 | 2.706  | 10.850  | 4.596      | 22.572        | 0.067  | 161.837   | 122.1    |

## Retained memory

Each row uses five independent processes with forced GC. Live is measured after verified work. Closed keeps the workload handles alive. Released drops them and samples again. Peak process RSS can remain high when V8 has reclaimed heap objects.

| Windows | Scenario            | Provider  | Verified | Loaded heap | Loaded RSS | Live heap | Live RSS | Closed heap | Closed RSS | Released heap | Released RSS | Peak RSS |
| ------- | ------------------- | --------- | -------- | ----------- | ---------- | --------- | -------- | ----------- | ---------- | ------------- | ------------ | -------- |
| 1       | windows-live        | RunDOM    | 5/5      | 17.0        | 106.2      | 18.8      | 108.6    | 18.9        | 108.6      | 18.2          | 108.7        | 108.7    |
| 1       | windows-live        | jsdom     | 5/5      | 40.9        | 188.3      | 45.5      | 199.8    | 45.5        | 199.8      | 43.6          | 199.6        | 199.9    |
| 1       | windows-live        | Happy DOM | 5/5      | 24.2        | 128.6      | 28.6      | 130.1    | 25.0        | 130.4      | 24.6          | 130.4        | 130.5    |
| 1       | windows-live        | TurboDOM  | 5/5      | 15.9        | 104.5      | 16.2      | 106.0    | 16.2        | 106.0      | 16.2          | 106.0        | 106.0    |
| 1       | windows-style-live  | RunDOM    | 5/5      | 17.0        | 106.1      | 26.4      | 136.9    | 26.4        | 136.9      | 25.5          | 136.9        | 136.9    |
| 1       | windows-style-live  | jsdom     | 5/5      | 40.9        | 188.5      | 49.5      | 220.3    | 49.5        | 220.3      | 49.4          | 220.3        | 220.4    |
| 1       | windows-style-live  | Happy DOM | 5/5      | 24.2        | 128.3      | 30.3      | 144.6    | 25.4        | 144.8      | 25.0          | 144.8        | 144.9    |
| 1       | windows-style-live  | TurboDOM  | 5/5      | 15.9        | 104.7      | 16.6      | 109.6    | 16.6        | 109.6      | 16.4          | 109.6        | 109.7    |
| 1       | parse-html-traverse | RunDOM    | 5/5      | 17.0        | 105.9      | 20.0      | 333.3    | 19.3        | 333.1      | 19.3          | 332.8        | 333.4    |
| 1       | parse-html-traverse | jsdom     | 5/5      | 40.9        | 189.2      | 46.3      | 729.7    | 46.3        | 729.7      | 46.2          | 729.7        | 768.9    |
| 1       | parse-html-traverse | Happy DOM | 5/5      | 24.2        | 128.8      | 25.2      | 256.8    | 25.2        | 256.8      | 25.2          | 256.8        | 258.0    |
| 1       | parse-html-traverse | TurboDOM  | 5/5      | 15.9        | 104.8      | 16.2      | 117.5    | 16.2        | 117.5      | 16.2          | 117.5        | 117.5    |
| 8       | windows-live        | RunDOM    | 5/5      | 17.0        | 106.2      | 22.6      | 119.5    | 22.6        | 119.5      | 18.9          | 119.7        | 119.7    |
| 8       | windows-live        | jsdom     | 5/5      | 40.9        | 188.9      | 58.2      | 225.0    | 58.2        | 225.0      | 43.8          | 223.3        | 225.0    |
| 8       | windows-live        | Happy DOM | 5/5      | 24.2        | 128.8      | 56.2      | 170.4    | 27.0        | 172.8      | 24.8          | 172.8        | 172.9    |
| 8       | windows-live        | TurboDOM  | 5/5      | 15.9        | 104.7      | 16.7      | 106.5    | 16.7        | 106.5      | 16.2          | 106.6        | 106.6    |
| 8       | windows-style-live  | RunDOM    | 5/5      | 17.0        | 106.2      | 31.0      | 165.8    | 31.1        | 166.2      | 26.4          | 166.3        | 166.3    |
| 8       | windows-style-live  | jsdom     | 5/5      | 40.9        | 188.7      | 65.9      | 257.0    | 65.8        | 257.0      | 50.0          | 255.7        | 257.1    |
| 8       | windows-style-live  | Happy DOM | 5/5      | 24.2        | 128.3      | 58.5      | 180.2    | 27.5        | 185.0      | 25.3          | 185.0        | 185.2    |
| 8       | windows-style-live  | TurboDOM  | 5/5      | 15.9        | 104.5      | 17.5      | 111.9    | 17.5        | 111.9      | 16.5          | 111.9        | 112.0    |
| 8       | parse-html-traverse | RunDOM    | 5/5      | 17.0        | 106.4      | 20.0      | 334.4    | 19.3        | 334.0      | 19.3          | 334.0        | 334.5    |
| 8       | parse-html-traverse | jsdom     | 5/5      | 40.9        | 188.6      | 46.3      | 724.8    | 46.3        | 724.8      | 46.2          | 724.8        | 763.9    |
| 8       | parse-html-traverse | Happy DOM | 5/5      | 24.2        | 128.2      | 25.2      | 256.3    | 25.2        | 256.3      | 25.2          | 256.3        | 257.3    |
| 8       | parse-html-traverse | TurboDOM  | 5/5      | 15.9        | 104.8      | 16.2      | 117.4    | 16.2        | 117.4      | 16.2          | 117.4        | 117.5    |
| 32      | windows-live        | RunDOM    | 5/5      | 17.0        | 106.2      | 33.4      | 146.8    | 33.4        | 146.8      | 19.1          | 146.8        | 146.8    |
| 32      | windows-live        | jsdom     | 5/5      | 40.9        | 188.6      | 102.7     | 323.0    | 102.8       | 323.0      | 45.5          | 316.5        | 323.0    |
| 32      | windows-live        | Happy DOM | 5/5      | 24.2        | 128.4      | 150.5     | 370.7    | 33.7        | 386.0      | 25.0          | 385.8        | 386.0    |
| 32      | windows-live        | TurboDOM  | 5/5      | 15.9        | 104.7      | 18.0      | 107.6    | 18.0        | 107.6      | 16.2          | 107.6        | 107.6    |
| 32      | windows-style-live  | RunDOM    | 5/5      | 17.0        | 106.2      | 44.6      | 175.2    | 44.6        | 175.5      | 26.7          | 175.6        | 175.6    |
| 32      | windows-style-live  | jsdom     | 5/5      | 40.9        | 188.4      | 122.5     | 344.2    | 122.4       | 344.3      | 51.9          | 338.0        | 344.3    |
| 32      | windows-style-live  | Happy DOM | 5/5      | 24.2        | 128.4      | 153.5     | 374.0    | 34.2        | 389.7      | 25.5          | 389.6        | 389.7    |
| 32      | windows-style-live  | TurboDOM  | 5/5      | 15.9        | 104.7      | 20.5      | 117.8    | 20.5        | 117.9      | 16.5          | 117.9        | 117.9    |
| 32      | parse-html-traverse | RunDOM    | 5/5      | 17.0        | 106.2      | 20.0      | 350.5    | 19.3        | 350.1      | 19.3          | 350.1        | 350.5    |
| 32      | parse-html-traverse | jsdom     | 5/5      | 40.9        | 188.5      | 46.3      | 728.2    | 46.3        | 728.2      | 46.2          | 728.2        | 767.6    |
| 32      | parse-html-traverse | Happy DOM | 5/5      | 24.2        | 128.4      | 25.2      | 255.7    | 25.2        | 255.7      | 25.2          | 255.7        | 256.7    |
| 32      | parse-html-traverse | TurboDOM  | 5/5      | 15.9        | 104.8      | 16.2      | 117.6    | 16.2        | 117.6      | 16.2          | 117.6        | 117.7    |

## Common-scenario totals

Each cell sums scenario process medians across exactly the same verified workloads within that matrix. This is an estimate of running one fresh process per scenario. Each individual row above reports its measured end-to-end process time.

| Matrix       | Common scenarios | RunDOM    | jsdom      | Happy DOM  | TurboDOM  |
| ------------ | ---------------- | --------- | ---------- | ---------- | --------- |
| timing-heavy | 8                | 1,469.694 | 5,752.150  | 3,553.108  | 1,028.823 |
| timing-light | 27               | 4,250.440 | 14,781.994 | 9,842.382  | 5,630.733 |
| dense        | 6                | 1,459.592 | 8,880.359  | 12,134.983 | 1,264.304 |

## Largest RunDOM deficits in completed pairs

| Matrix       | Comparator | Matched scenarios | RunDOM lower total | RunDOM lower warm batch | RunDOM lower peak RSS |
| ------------ | ---------- | ----------------- | ------------------ | ----------------------- | --------------------- |
| timing-heavy | jsdom      | 9                 | 9                  | 9                       | 9                     |
| timing-heavy | Happy DOM  | 9                 | 9                  | 9                       | 8                     |
| timing-heavy | TurboDOM   | 8                 | 1                  | 1                       | 1                     |
| timing-light | jsdom      | 34                | 34                 | 34                      | 34                    |
| timing-light | Happy DOM  | 29                | 29                 | 17                      | 27                    |
| timing-light | TurboDOM   | 28                | 7                  | 11                      | 2                     |
| dense        | jsdom      | 6                 | 6                  | 6                       | 6                     |
| dense        | Happy DOM  | 6                 | 6                  | 6                       | 6                     |
| dense        | TurboDOM   | 6                 | 2                  | 1                       | 0                     |

| Comparator | Metric         | Matrix       | Scenario                  | RunDOM  | Comparator value | Gap     |
| ---------- | -------------- | ------------ | ------------------------- | ------- | ---------------- | ------- |
| jsdom      | first-use      | timing-light | query-diverse             | 12.776  | 4.637            | 8.139   |
| jsdom      | first-use      | timing-light | query-batched-mutation    | 11.821  | 4.753            | 7.068   |
| jsdom      | first-use      | timing-light | query-complex             | 10.888  | 5.267            | 5.621   |
| jsdom      | scenario-setup | dense        | parse-html-sparse         | 0.759   | 0.732            | 0.028   |
| jsdom      | scenario-setup | timing-heavy | parse-html-update         | 0.354   | 0.351            | 0.003   |
| jsdom      | scenario-setup | timing-heavy | parse-html-traverse       | 0.359   | 0.356            | 0.003   |
| jsdom      | warmup         | timing-light | windows-live              | 3.654   | 1.881            | 1.773   |
| jsdom      | warmup         | timing-light | style-read                | 2.199   | 0.849            | 1.350   |
| jsdom      | warmup         | timing-light | mutation-observer         | 0.819   | 0.785            | 0.034   |
| Happy DOM  | warm           | timing-light | query-all-iterate         | 2.368   | 1.685            | 0.682   |
| Happy DOM  | warm           | timing-light | role-query                | 1.042   | 0.778            | 0.264   |
| Happy DOM  | warm           | timing-light | query-diverse             | 0.182   | 0.040            | 0.143   |
| Happy DOM  | measured       | timing-light | query-all-iterate         | 12.064  | 8.633            | 3.431   |
| Happy DOM  | measured       | timing-light | role-query                | 5.499   | 3.865            | 1.633   |
| Happy DOM  | measured       | timing-light | style-read                | 0.325   | 0.118            | 0.208   |
| Happy DOM  | first-use      | timing-light | windows-style-live        | 21.120  | 3.669            | 17.451  |
| Happy DOM  | first-use      | timing-light | style-inheritance         | 18.935  | 3.714            | 15.221  |
| Happy DOM  | first-use      | timing-light | style-inline-invalidation | 18.244  | 3.825            | 14.418  |
| Happy DOM  | scenario-setup | timing-light | style-inheritance         | 21.430  | 9.794            | 11.637  |
| Happy DOM  | scenario-setup | timing-light | style-inline-invalidation | 21.059  | 9.948            | 11.112  |
| Happy DOM  | scenario-setup | timing-light | style-read                | 20.330  | 9.586            | 10.745  |
| Happy DOM  | warmup         | timing-light | query-all-iterate         | 7.261   | 5.610            | 1.651   |
| Happy DOM  | warmup         | timing-light | fragment-write            | 5.014   | 4.151            | 0.863   |
| Happy DOM  | warmup         | timing-light | style-read                | 2.199   | 1.435            | 0.764   |
| Happy DOM  | peak           | timing-light | style-inheritance         | 173.9   | 158.8            | 15.1    |
| Happy DOM  | peak           | timing-heavy | windows-create-close      | 168.0   | 154.6            | 13.4    |
| Happy DOM  | peak           | timing-light | style-read                | 140.9   | 134.3            | 6.7     |
| TurboDOM   | total          | dense        | parse-html-traverse       | 273.951 | 166.964          | 106.986 |
| TurboDOM   | total          | timing-heavy | parse-html-traverse       | 206.321 | 124.308          | 82.013  |
| TurboDOM   | total          | timing-heavy | parse-html-update         | 204.136 | 128.651          | 75.485  |
| TurboDOM   | warm           | dense        | parse-html-traverse       | 11.909  | 3.278            | 8.631   |
| TurboDOM   | warm           | timing-heavy | parse-html-traverse       | 6.404   | 0.628            | 5.776   |
| TurboDOM   | warm           | timing-heavy | parse-html-update         | 6.322   | 0.923            | 5.399   |
| TurboDOM   | measured       | dense        | parse-html-traverse       | 60.786  | 17.167           | 43.619  |
| TurboDOM   | measured       | timing-heavy | parse-html-traverse       | 32.664  | 3.638            | 29.026  |
| TurboDOM   | measured       | timing-heavy | parse-html-update         | 32.131  | 4.844            | 27.287  |
| TurboDOM   | first-use      | timing-light | windows-style-live        | 21.120  | 1.606            | 19.514  |
| TurboDOM   | first-use      | timing-light | style-read                | 17.295  | 2.053            | 15.242  |
| TurboDOM   | first-use      | timing-light | style-inline-invalidation | 18.244  | 3.472            | 14.772  |
| TurboDOM   | scenario-setup | timing-light | windows-style-live        | 32.617  | 4.397            | 28.220  |
| TurboDOM   | scenario-setup | timing-light | style-inline-invalidation | 21.059  | 3.402            | 17.657  |
| TurboDOM   | scenario-setup | timing-light | style-read                | 20.330  | 3.222            | 17.109  |
| TurboDOM   | warmup         | dense        | parse-html-traverse       | 61.473  | 18.412           | 43.061  |
| TurboDOM   | warmup         | timing-heavy | parse-html-traverse       | 46.328  | 6.336            | 39.993  |
| TurboDOM   | warmup         | dense        | parse-html-rotate         | 75.141  | 37.951           | 37.190  |
| TurboDOM   | close          | timing-light | events-redispatch         | 0.111   | 0.059            | 0.052   |
| TurboDOM   | close          | timing-light | events-dispatch           | 0.104   | 0.063            | 0.041   |
| TurboDOM   | close          | timing-heavy | parse-html-sparse         | 0.059   | 0.034            | 0.026   |
| TurboDOM   | peak           | timing-light | fragment-table            | 321.1   | 155.5            | 165.6   |
| TurboDOM   | peak           | timing-light | fragment-table-read       | 316.3   | 155.5            | 160.8   |
| TurboDOM   | peak           | dense        | parse-html-unique         | 326.2   | 203.9            | 122.3   |

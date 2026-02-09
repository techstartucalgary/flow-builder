"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/make-cancellable-promise";
exports.ids = ["vendor-chunks/make-cancellable-promise"];
exports.modules = {

/***/ "(ssr)/./node_modules/make-cancellable-promise/dist/index.js":
/*!*************************************************************!*\
  !*** ./node_modules/make-cancellable-promise/dist/index.js ***!
  \*************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ makeCancellablePromise)\n/* harmony export */ });\nfunction makeCancellablePromise(promise) {\n    let isCancelled = false;\n    const wrappedPromise = new Promise((resolve, reject) => {\n        promise\n            .then((value) => !isCancelled && resolve(value))\n            .catch((error) => !isCancelled && reject(error));\n    });\n    return {\n        promise: wrappedPromise,\n        cancel() {\n            isCancelled = true;\n        },\n    };\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvbWFrZS1jYW5jZWxsYWJsZS1wcm9taXNlL2Rpc3QvaW5kZXguanMiLCJtYXBwaW5ncyI6Ijs7OztBQUFlO0FBQ2Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVDtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZmxvdy1idWlsZGVyLy4vbm9kZV9tb2R1bGVzL21ha2UtY2FuY2VsbGFibGUtcHJvbWlzZS9kaXN0L2luZGV4LmpzP2VjMDkiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWFrZUNhbmNlbGxhYmxlUHJvbWlzZShwcm9taXNlKSB7XG4gICAgbGV0IGlzQ2FuY2VsbGVkID0gZmFsc2U7XG4gICAgY29uc3Qgd3JhcHBlZFByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIHByb21pc2VcbiAgICAgICAgICAgIC50aGVuKCh2YWx1ZSkgPT4gIWlzQ2FuY2VsbGVkICYmIHJlc29sdmUodmFsdWUpKVxuICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4gIWlzQ2FuY2VsbGVkICYmIHJlamVjdChlcnJvcikpO1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICAgIHByb21pc2U6IHdyYXBwZWRQcm9taXNlLFxuICAgICAgICBjYW5jZWwoKSB7XG4gICAgICAgICAgICBpc0NhbmNlbGxlZCA9IHRydWU7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/make-cancellable-promise/dist/index.js\n");

/***/ })

};
;
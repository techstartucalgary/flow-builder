"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/merge-refs";
exports.ids = ["vendor-chunks/merge-refs"];
exports.modules = {

/***/ "(ssr)/./node_modules/merge-refs/dist/index.js":
/*!***********************************************!*\
  !*** ./node_modules/merge-refs/dist/index.js ***!
  \***********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ mergeRefs)\n/* harmony export */ });\n/**\n * A function that merges React refs into one.\n * Supports both functions and ref objects created using createRef() and useRef().\n *\n * Usage:\n * ```tsx\n * <div ref={mergeRefs(ref1, ref2, ref3)} />\n * ```\n *\n * @param {(React.Ref<T> | undefined)[]} inputRefs Array of refs\n * @returns {React.Ref<T> | React.RefCallback<T>} Merged refs\n */\nfunction mergeRefs() {\n    var inputRefs = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        inputRefs[_i] = arguments[_i];\n    }\n    var filteredInputRefs = inputRefs.filter(Boolean);\n    if (filteredInputRefs.length <= 1) {\n        var firstRef = filteredInputRefs[0];\n        return firstRef || null;\n    }\n    return function mergedRefs(ref) {\n        for (var _i = 0, filteredInputRefs_1 = filteredInputRefs; _i < filteredInputRefs_1.length; _i++) {\n            var inputRef = filteredInputRefs_1[_i];\n            if (typeof inputRef === 'function') {\n                inputRef(ref);\n            }\n            else if (inputRef) {\n                inputRef.current = ref;\n            }\n        }\n    };\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvbWVyZ2UtcmVmcy9kaXN0L2luZGV4LmpzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFhLDZCQUE2QjtBQUMxQztBQUNBO0FBQ0EsV0FBVyw4QkFBOEI7QUFDekMsYUFBYSxxQ0FBcUM7QUFDbEQ7QUFDZTtBQUNmO0FBQ0EscUJBQXFCLHVCQUF1QjtBQUM1QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0VBQWtFLGlDQUFpQztBQUNuRztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL2Zsb3ctYnVpbGRlci8uL25vZGVfbW9kdWxlcy9tZXJnZS1yZWZzL2Rpc3QvaW5kZXguanM/ZDQ0MCJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEEgZnVuY3Rpb24gdGhhdCBtZXJnZXMgUmVhY3QgcmVmcyBpbnRvIG9uZS5cbiAqIFN1cHBvcnRzIGJvdGggZnVuY3Rpb25zIGFuZCByZWYgb2JqZWN0cyBjcmVhdGVkIHVzaW5nIGNyZWF0ZVJlZigpIGFuZCB1c2VSZWYoKS5cbiAqXG4gKiBVc2FnZTpcbiAqIGBgYHRzeFxuICogPGRpdiByZWY9e21lcmdlUmVmcyhyZWYxLCByZWYyLCByZWYzKX0gLz5cbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7KFJlYWN0LlJlZjxUPiB8IHVuZGVmaW5lZClbXX0gaW5wdXRSZWZzIEFycmF5IG9mIHJlZnNcbiAqIEByZXR1cm5zIHtSZWFjdC5SZWY8VD4gfCBSZWFjdC5SZWZDYWxsYmFjazxUPn0gTWVyZ2VkIHJlZnNcbiAqL1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWVyZ2VSZWZzKCkge1xuICAgIHZhciBpbnB1dFJlZnMgPSBbXTtcbiAgICBmb3IgKHZhciBfaSA9IDA7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xuICAgICAgICBpbnB1dFJlZnNbX2ldID0gYXJndW1lbnRzW19pXTtcbiAgICB9XG4gICAgdmFyIGZpbHRlcmVkSW5wdXRSZWZzID0gaW5wdXRSZWZzLmZpbHRlcihCb29sZWFuKTtcbiAgICBpZiAoZmlsdGVyZWRJbnB1dFJlZnMubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgdmFyIGZpcnN0UmVmID0gZmlsdGVyZWRJbnB1dFJlZnNbMF07XG4gICAgICAgIHJldHVybiBmaXJzdFJlZiB8fCBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24gbWVyZ2VkUmVmcyhyZWYpIHtcbiAgICAgICAgZm9yICh2YXIgX2kgPSAwLCBmaWx0ZXJlZElucHV0UmVmc18xID0gZmlsdGVyZWRJbnB1dFJlZnM7IF9pIDwgZmlsdGVyZWRJbnB1dFJlZnNfMS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgIHZhciBpbnB1dFJlZiA9IGZpbHRlcmVkSW5wdXRSZWZzXzFbX2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFJlZiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGlucHV0UmVmKHJlZik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpbnB1dFJlZikge1xuICAgICAgICAgICAgICAgIGlucHV0UmVmLmN1cnJlbnQgPSByZWY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/merge-refs/dist/index.js\n");

/***/ })

};
;
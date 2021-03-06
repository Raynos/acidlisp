'use strict'
var {
  isDefined, isSymbol, isArray,
  isDef, isEmpty, isFunction, isNumber, isBound,
  eqSymbol, equals,
  isExpressionTree, pretty, meta
} = require('./util')

var syms = require('./symbols')

      //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     // FLATTEN                            //
    // take everything-is-an-expression   //
   // and convert it to wasm statements. //
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// ONLY RUN THIS ON FUNCTION BODIES! //

function last (ary) {
  return ary[ary.length-1]
}

function $ (n) {
  if(!isDefined(n)) throw new Error('undefined:$(n)')
  return Symbol('$'+n)
}

function trim (tree) {
  if(isArray(tree) && tree.length == 2 && tree[0] == syms.block)
    return tree[1]
  return tree
}

function insertDef(tree, sym) {
  if(isExpressionTree(tree))
    return [syms.def, sym, tree]
  else {
    var _tree = flatten(tree)
    if(isSymbol(last(_tree))) {
      //it so happens that the trailing symbol is the one
      //we need to define, then it will already be set, so just insert it.
      if(eqSymbol(last(_tree), sym.description)) {
        _tree.pop()
        return trim(_tree)
      }
    }
    _tree[_tree.length-1] = [syms.def, sym, last(_tree)]
    return trim(_tree)
  }
}


function defaultFlatten (tree, n) {
  var block = [syms.block]
  var _tree = [tree[0]]
  tree.forEach((branch,i) => {
    if(isExpressionTree(branch)) _tree[i] = branch
    else {
      var _branch = flatten(branch, n+i)
      block.push(_branch)
      //XXX use insertDef here?
      if(isSymbol(last(_branch))) {
        _tree[i] = _branch.pop()
        if(_branch.length == 2) //[block, something]
          block[block.length-1] = _branch[1]
      }
      else {
        _branch[_branch.length-1] = [syms.def, $(n+i), last(_branch)]
        _tree[i] = $(n+i)
      }
    }
  })
  block.push(_tree)
  return meta(tree, block)

}

//this is working for current tests, but I am sure it has bugs

var flatten = module.exports = function (tree, n) {
  return meta(tree, _flatten(tree, n))
}

function _flatten (tree, n) {
  n = n || 1
  if(isExpressionTree(tree)) return tree

  if(tree[0] === syms.if) {
    var sym = $(n)
    if(isExpressionTree(tree[1])) {
      var block =  [syms.block, [syms.if,
        tree[1], insertDef(tree[2], sym), insertDef(isDefined(tree[3]) ? tree[3] : 0, sym)
      ], sym]
      return block
    }
    else {
      ///throw new Error('if with non-expression test not implemented yet')
      var block = flatten(tree[1], n)
      //throw new Error('if with statement test')
      var test = block.pop()
      block.push([syms.if, test,
        insertDef(tree[2], sym),
        insertDef(isDefined(tree[3]) ? tree[3] : 0, sym)
      ])
      block.push(sym)
      return block
    }
  }
  else if(tree[0] === syms.block) {
    var block = [syms.block], value
    for(var i = 1; i < tree.length; i++) {
      if(isExpressionTree(tree[i]))
        block.push(tree[i])
      else {
        var _tree = flatten(tree[i])
        if(_tree[0] != syms.block)
          throw new Error('expected block!:'+stringify(_tree))
        //if we are not at the last block expression
        //we can dump the value symbol
        if(isSymbol(last(_tree)) && i + 1 < tree.length)
          value = _tree.pop()

        //append the items into the same block
        for(var j = 1; j < _tree.length; j++)
          block.push(_tree[j])
      }
    }
    return block
  }
  else if(tree[0] === syms.loop) {
    var isExpr = isExpressionTree(tree[1])
    var m = isExpr ? n : n + 1
    return [syms.block, [syms.loop,
      isExpr ? tree[1] : flatten(tree[1], n),
      insertDef(
        isExpressionTree(tree[2]) ? tree[2] : flatten(tree[2], m),
        $(m)
      )], $(m)]
  }
  else if (isSymbol(tree[0]) && /_store\d*$/.test(tree[0].description)) {
    var block = defaultFlatten(tree, n)
    if(syms.block === block[0]) {
      var store = last(block)
      if(isSymbol(last(store)))
        block.push(last(store))
      else {//must be an expression tree
        var store = block.pop()
        var value = store.pop()
        var ref = $(++n)
        if(!isExpressionTree(value))
          throw new Error('expected expression tree')
        block.push(insertDef(value, ref))
        store.push(ref)
        block.push(store)
        block.push(ref)
      }
    }
    return block
  }
  else
    return defaultFlatten(tree, n)
}

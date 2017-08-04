var asdf = "data:{\"image\":\"\",\"requestcount\":0,\"allPointsB\":[[9.814995547304305,2.7220816326530404,1]]}"
var asdf = asdf.split("data:")[1]
var parsed = JSON.parse(asdf)

console.log(parsed)

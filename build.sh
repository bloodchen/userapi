source ./env
NAME="userapi"
PORT="${dockerPort:=8100}"

docker build -t $NAME .
docker container stop $NAME
docker container rm $NAME
docker run --name $NAME --ulimit nofile=90000:90000 -p $PORT:8080 --restart=always -d $NAME

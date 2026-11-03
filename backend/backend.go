package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"sort"
	"strings"
	"syscall"
)

var dataPath, netspocPath string

type objects struct {
	Network map[string]json.RawMessage `json:"network"`
	Router  map[string]json.RawMessage `json:"router"`
	Area    map[string]json.RawMessage `json:"area"`
}

var data *objects

func getObject(name string) (json.RawMessage, error) {
	var field map[string]json.RawMessage
	obj := strings.SplitN(name, ":", 2)
	switch obj[0] {
	case "router":
		field = data.Router
	case "network":
		field = data.Network
	case "area":
		field = data.Area
	default:
		return nil, errors.New(fmt.Sprintf("Unsupported Type \"%s\"", obj[0]))
	}
	return field[name], nil
}

func getHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Need \"id\" Param", http.StatusBadRequest)
		return
	}

	out, err := getObject(id)
	code := http.StatusBadRequest
	if err != nil || out == nil {
		if out == nil {
			err = errors.New(fmt.Sprintf("Error: Object %s not found", id))
			code = http.StatusNotFound
		}
		http.Error(w, err.Error(), code)
		return
	}
	fmt.Fprintf(w, "%v\n", string(out))
}

func pathHandler(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	destination := r.URL.Query().Get("destination")
	if source == "" || destination == "" {
		http.Error(w, "Need \"source\" and \"destination\" Param", http.StatusBadRequest)
		return
	}
	cmd := exec.Command("print-path", "-q", netspocPath, source, destination)
	var outb, errb bytes.Buffer
	cmd.Stdout = &outb
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		http.Error(w, errb.String(), http.StatusBadRequest)
		return
	}
	fmt.Fprintf(w, "%v", outb.String())
}

func areasHandler(w http.ResponseWriter, r *http.Request) {
	// Return list of all area names
	areaNames := make([]string, 0, len(data.Area))
	for areaName := range data.Area {
		areaNames = append(areaNames, areaName)
	}
	sort.Strings(areaNames)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(areaNames)
}

func namesHandler(w http.ResponseWriter, r *http.Request) {
	// Return the ids of all routers, networks and areas, used for
	// autocomplete in the object loader.
	names := make([]string, 0, len(data.Router)+len(data.Network)+len(data.Area))
	for name := range data.Router {
		names = append(names, name)
	}
	for name := range data.Network {
		names = append(names, name)
	}
	for name := range data.Area {
		names = append(names, name)
	}
	sort.Strings(names)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(names)
}

func loadObjectsFromFile() {
	//content, err := os.ReadFile(path.Join(dataPath, "objects.json"))
	file := path.Join(dataPath, "objects.json")
	fd, err := os.Open(file)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer fd.Close()
	dec := json.NewDecoder(fd)
	newData := &objects{}
	if err := dec.Decode(newData); err != nil {
		fmt.Fprintln(os.Stderr, errors.New(fmt.Sprintf("Error decoding %s: %v", file, err)))
		os.Exit(1)
	}

	data = newData
	log.Printf("Loaded Objects from %s (%d routers, %d networks, %d areas)",
		file, len(data.Router), len(data.Network), len(data.Area))
}

func main() {

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGHUP)
	go func() {
		for {
			sig := <-sigs
			log.Printf("Got signal: %v", sig)
			loadObjectsFromFile()
		}
	}()

	dataPath = os.Getenv("VISDATA")
	netspocPath = os.Getenv("VISSPOC")
	listenport := os.Getenv("LISTENPORT")
	listenaddress := os.Getenv("LISTENADDRESS")

	if dataPath == "" || netspocPath == "" || listenaddress == "" || listenport == "" {
		fmt.Fprintln(os.Stderr, "Benötigte Umgebungsvariablen: VISDATA VISSPOC LISTENPORT LISTENADDRESS")
		os.Exit(1)
	}

	loadObjectsFromFile()

	http.HandleFunc("/get", getHandler)
	http.HandleFunc("/path", pathHandler)
	http.HandleFunc("/areas", areasHandler)
	http.HandleFunc("/names", namesHandler)
	log.Printf("Listening on %s:%s", listenaddress, listenport)
	log.Fatal(http.ListenAndServe(listenaddress+":"+listenport, nil))
}

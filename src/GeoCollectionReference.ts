import { GeoTransaction } from './GeoTransaction';
import { GeoFirestoreTypes } from './GeoFirestoreTypes';
import { GeoFirestore } from './GeoFirestore';
import { GeoDocumentReference } from './GeoDocumentReference';
import { GeoQuery } from './GeoQuery';
import { findCoordinates, encodeGeohash, encodeGeoDocument, GEOHASH_PRECISION, newCentroid } from './utils';

/**
 * A `GeoCollectionReference` object can be used for adding documents, getting document references, and querying for documents (using the
 * methods inherited from `GeoQuery`).
 */
export class GeoCollectionReference extends GeoQuery {
  /**
   * @param _collection The `CollectionReference` instance.
   */
  constructor(private _collection: GeoFirestoreTypes.cloud.CollectionReference | GeoFirestoreTypes.web.CollectionReference) {
    super(_collection);
  }

  /** The native `CollectionReference` instance. */
  get native(): GeoFirestoreTypes.cloud.CollectionReference | GeoFirestoreTypes.web.CollectionReference {
    return this._collection;
  }

  /** The identifier of the collection. */
  get id(): string {
    return this._collection.id;
  }

  /**
   * A reference to the containing Document if this is a subcollection, else null.
   */
  get parent(): GeoDocumentReference | null {
    return this._collection.parent ? new GeoDocumentReference(this._collection.parent) : null;
  }

  /**
   * A string representing the path of the referenced collection (relative
   * to the root of the database).
   */
  get path(): string {
    return this._collection.path;
  }

  /**
   * Add a new document to this collection with the specified data, assigning it a document ID automatically.
   *
   * @param data An Object containing the data for the new document.
   * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
   * @param withClusters A Boolean which allow us to know if it's about a cluster or not.
   * @return A Promise resolved with a `GeoDocumentReference` pointing to the newly created document after it has been written to the
   * backend.
   */
  add = async (
    data: GeoFirestoreTypes.DocumentData,
    customKey?: string,
    withClusters?: Boolean,
  ): Promise<GeoDocumentReference> => {

    if (Object.prototype.toString.call(data) === '[object Object]') {
      var location = findCoordinates(data, customKey);
      const geohash: string = encodeGeohash(data.coordinates);
      if (withClusters == true) {
        let i = 0;
        const geofirestore = new GeoFirestore(this._collection.firestore);

        while (i < GEOHASH_PRECISION) {
          const curGeohash: string = geohash.substring(0, i + 1);

          // Get document reference
          const ref = await (this._collection as GeoFirestoreTypes.cloud.CollectionReference).doc(curGeohash);

          // Transaction
          try {
            await geofirestore.runTransaction(async (t) => {
              // Init GeoTransaction
              const geotransaction = new GeoTransaction(t);
              // Get snapshot
              const snapshot = await geotransaction.get(ref)
              // Complete existing documents by incrementing the size and calculate new centroïde
              if (snapshot.exists) {
                // Get data from snapshot
                const cluster = snapshot.data();
                // Incrementing cluster size
                let newSize = cluster.s + 1;
                // Get old centroïd
                const oldLocation = cluster.l;
                location = newCentroid(oldLocation, data.coordinates, newSize);
                // Set document with geotransaction
                geotransaction.set(ref, encodeGeoDocument(location, curGeohash, data, true, newSize), { customKey: 'l' });
              }
              // Create documents
              else if (!snapshot.exists) {
                // get id of the ressource you're adding
                data.pointId = data.id;
                location = data.coordinates;
                this._collection.doc(curGeohash).set(encodeGeoDocument(location, curGeohash, data, true, 1))
              }
            });
          }
          catch (e) {
            console.error('Transaction failure:', e);
          }
          i++;
        }
      }
      else
        return (this._collection as GeoFirestoreTypes.cloud.CollectionReference)
          .add(encodeGeoDocument(location, geohash, data)).then(doc => new GeoDocumentReference(doc as FirebaseFirestore.DocumentReference));
    } else {
      throw new Error('document must be an object');
    }
    return null
  }

  /**
  * Get a `GeoDocumentReference` for the document within the collection at the specified location.
  *
  * @param location A geopoint.
  * @return The `GeoDocumentReference` instance.
  */
  getRefFromLocation(location: GeoFirestoreTypes.cloud.GeoPoint): GeoDocumentReference {
    const geohash: string = encodeGeohash(location);
    return new GeoDocumentReference(this._collection.doc(geohash))
  }

  /**
   * Get a `GeoDocumentReference` for the document within the collection at the specified path. If no path is specified, an
   * automatically-generated unique ID will be used for the returned GeoDocumentReference.
   *
   * @param documentPath A slash-separated path to a document.
   * @return The `GeoDocumentReference` instance.
   */
  doc(documentPath?: string): GeoDocumentReference {
    return (documentPath) ? new GeoDocumentReference(this._collection.doc(documentPath)) : new GeoDocumentReference(this._collection.doc());
  }
}

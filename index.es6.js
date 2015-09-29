import fs from 'fs'
import path from 'path'
import readline from 'readline'
import chalk from 'chalk'
import tv4 from 'tv4'
import async from 'async'
import npmPackage from './package.json'
import './polyfills'

const pathp = path.posix

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const _debug = ( ...args ) => 
  console.log.apply( console.log, [ '[debug]' ].concat( args ) )

const types = {
  array: [],
  boolean: false,
  number: 0,
  null: null,  
  object: {},
  string: ''
}

const colors = {
  array: chalk.green.bold,
  boolean: chalk.blue.bold,
  number: chalk.magenta.bold,
  null: chalk.red.bold,
  object: chalk.cyan.bold,
  string: chalk.yellow.bold,
  value: chalk.white.bold,
  default: chalk.grey
}

const typeNames = Object.keys( types )

const Keys = {
  array: ( node ) => [ ...node.keys() ],
  object: ( node ) => Object.keys( node )
}

const sep = '/'

let root = {}
let current = sep

const Split = dir => dir.toString().split( sep ).filter( s => s !== '' )

const ResolveCurrent = dir => 
  pathp.resolve( current, dir.toString() )

const Node = ( obj, dir ) => {
  if( dir === sep ) return obj
  
  return Split( ResolveCurrent( dir ) ).reduce(
    ( target, seg ) => target[ seg ], 
    obj  
  )
}

const Type = obj => 
  typeNames.reduce( 
    ( name, typeName ) =>
      !name && tv4.validate( obj, { type: typeName } ) ? 
        typeName : 
        name,
    undefined
  )
  
const File = ( obj, dir ) => {
  const value = Node( obj, dir )
  const size = JSON.stringify( value ).length
  const type = Type( value )
  const name = Split( dir ).pop()
  const iterable = type in Keys
  return { type, name, iterable, size, value }
}

const IsNode = ( obj, dir ) => Node( obj, dir ) !== undefined

const IsPath = ( obj, dir ) => {
  const node = Node( obj, dir )
  const type = Type( node )
  return type in Keys
}
  
const Files = ( obj, dir ) => {
  const node = Node( obj, dir )
  const type = Type( node )  
  const relative = [ '.' ].concat( obj === node ? [] : '..' )
  const keys = Keys[ type ] ? Keys[ type ]( node ) : []
  
  return keys
    .concat( relative )
    .map( name => 
      File( root, name ) 
    )
}

const Paragraph = str => `\n${str}\n`

const ColumnText = ( str, width, align ) => {
  const len = str.length
  
  if( len < width ){
    const padding = ' '.repeat( width - len )
    
    if( align === 'right' ) return padding + str
    
    return str + padding
  }
  
  return str
}

const Column = ( text, color = colors.default, align = 'left' ) => {
  let column = { text: text.toString(), color, align }
  
  column.Render = ( width = false ) => 
    width ? 
      column.color( ColumnText( column.text, width, column.align ) ) :
      column.color( column.text )
      
  return column
}

const Listing = file =>  
  [ 
    Column( 
      file.name, 
      file.iterable ? colors[ file.type ] : colors.value
    ),
    Column( 
      file.iterable ? '...' : JSON.stringify( file.value ),
      file.iterable ? colors.default : colors[ file.type ]
    ),
    Column( file.type ),
    Column( file.size, colors.default, 'right' )
  ]

const FormatListing = ( listing, widths = false ) =>  
  listing
    .map( ( column, i ) => 
      widths ? column.Render( widths[ i ] ) : column.Render()
    ).join( '    ' )
  
const Table = files => {
  const listings = files.map( Listing )
  
  const findWidestCol = ( widths, listing ) => {
    listing.forEach( ( col, i ) => {
      widths[ i ] = widths[ i ] || 0      
      widths[ i ] = Math.max( widths[ i ], col.text.length )
    })
    
    return widths
  }
  
  const widths = listings.reduce( findWidestCol, {} )
  
  return Paragraph( listings.map( 
    listing => 
      FormatListing( listing, widths )
  ).join( '\n' ) )
}

const Job = ( name, args, silent = false ) => {
  let job = { name, args, silent }
  
  job.execute = cb => 
    commands[ job.name ]( job.args, cb )
  
  return job
}

const batch = ( jobs, cb ) => {
  const processJob = ( output, job, next ) =>
    job.execute( ( err, out ) => {
      if( err ){
        next( err )
        return
      }
    
      next( null, job.silent ? output : output + out )
    }) 
    
  async.reduce( jobs, '', processJob, cb )
}

const load = ( fn, cb ) => {
  const filename = fn.endsWith( '.json' ) ? fn : fn + '.json'
    
  fs.readFile( filename, 'utf8', ( err, json ) => {
    if( err ){
      cb( err )
      return
    }
    
    cb( null, JSON.parse( json ) )
  })
}

const save = ( filename, cb ) =>
  fs.writeFile( filename, JSON.stringify( Node( root, current ) ), 'utf8', cb )
  
const commands = {
  ls: ( args, cb ) => {
    if( !args.length ){
      cb( null, Table( Files( root, current ) ) )      
      return
    }
    
    const cwd = current
    const jobs = [
      Job( 'cd', args, true ),
      Job( 'ls', [] ),
      Job( 'cd', [ cwd ], true )
    ]
    
    batch( jobs, cb )
  },
      
  clear: ( args, cb ) => cb( null, '\u001b[2J\u001b[0;0H' ),
    
  cd: ( args, cb ) => {
    const p = ResolveCurrent( args.join( ' ' ).trim() )
    
    if( !IsPath( root, p ) ){
      cb( null, Paragraph( 'Path not found' ) )
      return
    }
    
    current = p
    
    cb( null, '' )
  },
  
  set: ( args, cb ) => {
    const node = Node( root, current )
    const key = args[ 0 ]
    const value = args.splice( 1 ).join( ' ' )
    
    node[ key ] = JSON.parse( value )
    
    const file = File( root, pathp.join( current, key ))
    const listing = FormatListing( Listing( file ) )

    cb( null, Paragraph( listing ) )
  },
  
  rm: ( args, cb ) => {
    const node = Node( root, current )    
    const key = args[ 0 ]
    
    if( !key in node ){
      cb( null, Paragraph( 'Property not found' ) )
      return
    }
    
    delete node[ key ]
    
    cb( null, Paragraph( 'Removed ' + key ) )
  },
  
  json: ( args, cb ) =>
    cb( null, Paragraph( JSON.stringify( Node( root, current ), null, 2 ) ) ),
    
  ver: ( args, cb ) => 
    cb( null, Paragraph( npmPackage.name + ' ' + npmPackage.version ) ),
  
  load: ( args, cb ) => {
    load( args[ 0 ], ( err, obj ) => {
      if( err ){
        cb( err )
        return
      }
      
      root = obj
      current = sep
      
      commands.json( [], cb )
    })
  },
  
  save: ( args, cb ) => {
    save( args[ 0 ], err => {
      if( err ){
        cb( err )
        return
      }
      
      cb( null, Paragraph( 'Saved ' + args[ 0 ] ) )
    })
  },
  
  help: ( args, cb ) =>
    cb( null, Paragraph( [
      colors.value( 'json' ) + ' - view current node as json',
      colors.value( 'ls [path]' ) + ' - list contents of object or array node, defaults to cwd',
      colors.value( 'cd path' ) + ' - navigate to an object or array element node',
      colors.value( 'set property value' ) + ' - set property on current node to value',
      colors.value( 'rm property' ) + ' - removes a property from current node',
      colors.value( 'load path' ) + ' - load JSON from file',
      colors.value( 'save path' ) + ' - save current node to file',
      colors.value( 'ver' ) + ' - current version',
      colors.value( 'clear' ) + ' - clear screen'
    ].join( '\n' ) ) ),
  
  '': ( args, cb ) => cb( null )
}

const aliases = {
  dir: 'ls',
  cls: 'clear',
  value: 'json',
  val: 'json'
}

Object.keys( aliases ).forEach( alias => 
  commands[ alias ] = commands[ aliases[ alias ] ] 
)

const Prompt = () => {
  const node = Node( root, current )
  const type = Type( node )
  const color = colors[ type ]
  
  return colors.value( current + ':' ) + 
    color( type ) + 
    colors.value( '>' )
}

const loop = () => {
  rl.question( Prompt(), input => {
    const args = input.split( ' ' )
    const command = args.shift().trim().toLowerCase()
    
    if( [ 'quit', 'exit' ].includes( command ) ){
      rl.close()
      return
    }
    
    if( command in commands ){
      commands[ command ]( args, ( err, output ) => {
        if( err ){
          rl.close()
          console.error( err )
          return
        }
        
        if( output !== undefined ) console.log( output )
        loop()
      }) 
    } else {
      console.log( Paragraph( 'Command not found' ) )
      loop()
    }
  })
}

if( process.argv.length > 2 ){
  load( process.argv[ 2 ], err => {
    if( err ){
      rl.close()
      throw err
      return
    }
    
    loop()
  })
} else {
  loop()
}  